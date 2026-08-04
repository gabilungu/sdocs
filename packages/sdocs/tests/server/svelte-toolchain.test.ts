/**
 * One toolchain, the project's.
 *
 * sdocs' peers get installed beside sdocs under npx, so two svelte copies can exist at
 * once. The pieces must not come from different ones: previews RUN the project's svelte
 * (resolve.dedupe), so the project's compiler must produce them. When 5.55 compiled and
 * 5.56 ran, every component page went blank with "target.exclude.has is not a function"
 * — generated code and runtime had disagreed about `rest_props`' exclude argument
 * (Array → Set). These tests pin the resolution, not that particular contract.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
	bundledSvelteVersion,
	loadSveltePlugin,
	loadSvelteCompiler,
	projectSvelteVersion,
	svelteDedupe,
	svelteSourceDeps,
} from '../../src/lib/server/svelte-toolchain.js';

const require = createRequire(import.meta.url);
const dirs: string[] = [];

/** A project tree whose node_modules holds fakes at the given versions. */
function fakeProject(pkgs: Record<string, { version: string; main?: string; exports?: unknown }>): string {
	const dir = mkdtempSync(join(tmpdir(), 'sdocs-toolchain-'));
	dirs.push(dir);
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0' }));
	for (const [name, spec] of Object.entries(pkgs)) {
		const target = join(dir, 'node_modules', ...name.split('/'));
		mkdirSync(target, { recursive: true });
		writeFileSync(
			join(target, 'package.json'),
			JSON.stringify({ name, version: spec.version, type: 'module', ...(spec.exports ? { exports: spec.exports } : { main: spec.main ?? 'index.js' }) })
		);
	}
	return dir;
}

describe('svelte toolchain resolution', () => {
	it('reports the version the PROJECT will run, not sdocs own', () => {
		const project = fakeProject({ svelte: { version: '9.9.9' } });
		expect(projectSvelteVersion(project)).toBe('9.9.9');
		expect(projectSvelteVersion(project)).not.toBe(bundledSvelteVersion());
	});

	it('dedupes svelte only when the project actually has one', () => {
		expect(svelteDedupe(fakeProject({ svelte: { version: '9.9.9' } }))).toEqual(['svelte']);
		expect(svelteDedupe(fakeProject({}))).toEqual([]);
	});

	it('loads vite-plugin-svelte FROM THE PROJECT when it has one', async () => {
		// The plugin binds svelte/compiler from beside itself, so taking the project's
		// copy is what makes the compiler match the deduped runtime.
		const project = fakeProject({});
		const target = join(project, 'node_modules', '@sveltejs', 'vite-plugin-svelte');
		mkdirSync(target, { recursive: true });
		writeFileSync(
			join(target, 'package.json'),
			JSON.stringify({ name: '@sveltejs/vite-plugin-svelte', version: '9.9.9', type: 'module', main: 'index.js' })
		);
		writeFileSync(join(target, 'index.js'), `export const svelte = () => ({ name: 'from-the-project' });\n`);

		const plugin = await loadSveltePlugin(project);
		expect((plugin as () => { name: string })().name).toBe('from-the-project');
	});

	it('falls back to its own plugin when the project has none', async () => {
		const plugin = await loadSveltePlugin(fakeProject({}));
		const applied = plugin();
		const names = (Array.isArray(applied) ? applied : [applied]).map((p) => (p as { name: string }).name);
		expect(names.join(' ')).toContain('vite-plugin-svelte');
	});

	it('takes svelte/compiler from the project, and it actually COMPILES', async () => {
		// Symlink the real svelte in: the compiler must be usable, not merely imported.
		// `svelte/compiler` resolves to a CJS entry, and importing a resolved FILE PATH
		// skips export conditions — so the named exports arrive under `default` and a
		// naive `{ compile }` destructure yields undefined. That shipped once; this is
		// the test that would have caught it, so it calls compile rather than typeof-ing it.
		const project = fakeProject({});
		const realSvelte = dirname(require.resolve('svelte/package.json'));
		mkdirSync(join(project, 'node_modules'), { recursive: true });
		symlinkSync(realSvelte, join(project, 'node_modules', 'svelte'), 'dir');

		const compiler = await loadSvelteCompiler(project);
		expect(typeof compiler.compile).toBe('function');
		const { js } = compiler.compile('<p>{name}</p>', { name: 'Probe', generate: 'client' });
		expect(js.code).toContain('Probe');
	});

	it('falls back to its own compiler, equally callable', async () => {
		const compiler = await loadSvelteCompiler(fakeProject({}));
		expect(compiler.compile('<p>hi</p>', { name: 'Fallback', generate: 'client' }).js.code).toBeTruthy();
	});
});

/**
 * A project declaring `deps` in its package.json, with each installed under
 * node_modules exactly as `spec` describes it.
 */
function projectWithDeps(deps: Record<string, Record<string, unknown>>): string {
	const dir = mkdtempSync(join(tmpdir(), 'sdocs-optimize-'));
	dirs.push(dir);
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({ name: 'host', version: '0.0.0', dependencies: Object.fromEntries(Object.keys(deps).map((n) => [n, '*'])) })
	);
	for (const [name, manifest] of Object.entries(deps)) {
		if (manifest.__missing) continue; // declared, never installed
		const target = join(dir, 'node_modules', ...name.split('/'));
		mkdirSync(target, { recursive: true });
		writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', ...manifest }));
		writeFileSync(join(target, 'index.js'), 'export default 1;\n');
	}
	return dir;
}

/**
 * esbuild has no `.svelte` loader, so a dependency shipping components as source
 * must never reach the dep optimizer — @lucide/svelte re-exports straight into
 * `./arrow-right.svelte`, and prebundling it 504s the import and drops the icon.
 * The `svelte` export condition is how such a package announces itself.
 */
describe('svelte-source dependencies (optimizeDeps.exclude)', () => {
	it('finds a package whose exports carry a svelte condition', () => {
		const project = projectWithDeps({
			'@lucide/svelte': { exports: { './icons/*': { svelte: './dist/icons/*.js', default: './dist/icons/*.js' } } },
			lodash: { main: 'index.js' },
		});
		expect(svelteSourceDeps(project)).toEqual(['@lucide/svelte']);
	});

	it('finds one declaring the legacy top-level svelte field', () => {
		const project = projectWithDeps({ 'old-lib': { svelte: 'src/index.js', main: 'index.js' } });
		expect(svelteSourceDeps(project)).toEqual(['old-lib']);
	});

	it('never excludes svelte itself — it ships compiled runtime and IS prebundled', () => {
		const project = projectWithDeps({ svelte: { exports: { '.': { svelte: './index.js', default: './index.js' } } } });
		expect(svelteSourceDeps(project)).toEqual([]);
	});

	it('reads a package that does not export ./package.json', () => {
		// esm-env is the real case: resolving `<pkg>/package.json` throws
		// ERR_PACKAGE_PATH_NOT_EXPORTED, so the manifest is found from the entry.
		const project = projectWithDeps({
			'sealed-lib': { exports: { '.': './index.js' }, svelte: 'src/index.js' },
		});
		expect(svelteSourceDeps(project)).toEqual(['sealed-lib']);
	});

	it('ignores a dependency that is declared but not installed', () => {
		const project = projectWithDeps({ ghost: { __missing: true } });
		expect(svelteSourceDeps(project)).toEqual([]);
	});

	it('returns nothing for a project with no package.json at all', () => {
		expect(svelteSourceDeps(mkdtempSync(join(tmpdir(), 'sdocs-empty-')))).toEqual([]);
	});
});

process.on('exit', () => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

