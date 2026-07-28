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

	it('takes svelte/compiler from the project too', async () => {
		// Symlink the real svelte in: the compiler must be importable, not a stub.
		const project = fakeProject({});
		const realSvelte = dirname(require.resolve('svelte/package.json'));
		mkdirSync(join(project, 'node_modules'), { recursive: true });
		symlinkSync(realSvelte, join(project, 'node_modules', 'svelte'), 'dir');

		const compiler = await loadSvelteCompiler(project);
		expect(typeof compiler.compile).toBe('function');
		expect(resolve(project, 'node_modules', 'svelte')).toBeTruthy();
	});
});

process.on('exit', () => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
