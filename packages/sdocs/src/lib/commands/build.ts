import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig, normalizeBase } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { generateBuildFiles, cleanBuildFiles } from '../server/app-gen.js';
import { discoverDocFiles } from '../server/discovery.js';
import { parseSdoc } from '../language/index.js';
import { planEntitySnippets } from '../server/doc-model.js';
import { buildSections, type SectionMap } from '../explorer/tree-builder.js';
import type { DocEntry, ResolvedSdocsConfig } from '../types.js';
import { svelteDedupe } from './dev.js';

export async function buildCommand(opts?: { base?: string }): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	// A --base flag overrides the config (lets CI derive it from the repo name).
	if (opts?.base !== undefined) config.base = normalizeBase(opts.base);

	console.log('[sdocs] Building static site...');
	if (config.base !== '/') console.log(`[sdocs] Base path: ${config.base}`);

	// Validate the site structure up front — an unknown @section, a route
	// collision, or a bad home path must fail the build, not deploy broken.
	const map = await buildSiteMap(config, cwd);
	if (map.errors.length > 0) {
		console.error(`[sdocs] ${map.errors.length} site structure error(s):`);
		for (const e of map.errors) {
			console.error(`  ✗ ${e.message}${e.file ? `\n    ${e.file}` : ''}`);
		}
		process.exit(1);
	}

	// Generate the staging directory (in the OS temp dir) with entry + preview HTML files
	const { sdocsDir, inputs } = await generateBuildFiles(config, cwd);
	const inputCount = Object.keys(inputs).length;
	console.log(`[sdocs] Generated ${inputCount} page(s) (1 main + ${inputCount - 1} previews)`);

	// Resolve include patterns to absolute paths
	const absoluteIncludes = config.include.map((p) => resolve(cwd, p));

	try {
		await build({
			configFile: false,
			root: sdocsDir,
			// The project's static assets (config `static`), copied into dist/
			publicDir: config.static ?? false,
			resolve: {
				dedupe: svelteDedupe(cwd),
			},
			plugins: [
				svelte(),
				sdocsPlugin({ ...config, include: absoluteIncludes, _buildMode: true } as any),
			],
			// The site's public base path (config `base`, normalized) — asset
			// URLs and the history-route prefix. '/' for a root deploy.
			base: config.base,
			// Don't minify CSS. Vite 8's default minifier is lightningcss, a
			// strict parser that rejects custom-property names browsers accept
			// (e.g. `--bg+100`) — and the project's stylesheet is ours to serve,
			// not to validate. ('esbuild' isn't an option: rolldown-vite doesn't
			// bundle it.) JS is still minified; the CSS gain isn't worth the risk.
			build: {
				outDir: resolve(cwd, 'dist'),
				emptyOutDir: true,
				cssMinify: false,
				rollupOptions: {
					input: inputs,
				},
			},
		});

		// History routing: every route gets a physical index.html (a copy of the
		// shell — asset URLs are root-absolute), so deep links work on any
		// static host with no rewrite rules.
		if ((config.routing ?? 'history') === 'history') {
			const count = await emitRoutePages(map, cwd);
			console.log(`[sdocs] Emitted ${count} route page(s)`);
		}

		console.log(`[sdocs] Build complete → dist/`);
	} finally {
		await cleanBuildFiles(sdocsDir);
	}
}

/** The site's section/route map, derived from the doc files exactly as the
 * Explorer derives it — one validation, two consumers. */
async function buildSiteMap(config: ResolvedSdocsConfig, cwd: string) {
	const files = await discoverDocFiles(config.include, cwd);
	const stubs: DocEntry[] = [];
	for (const filePath of files) {
		const doc = parseSdoc(await readFile(filePath, 'utf-8'));
		for (const entity of doc.entities) {
			stubs.push({
				kind:
					entity.kind === 'SHOWCASE'
						? 'component'
						: entity.kind === 'DOC'
							? 'doc'
							: entity.kind === 'PAGE'
								? 'page'
								: 'layout',
				filePath,
				entitySlug: entity.slug,
				meta: { title: entity.title },
				previews: [],
				examples:
					entity.kind === 'SHOWCASE'
						? planEntitySnippets(entity)
								.filter((s) => s.role === 'example')
								.map((s) => ({ name: s.name, slug: s.slug, role: s.role, body: '' }))
						: [],
				content: null,
				routeSlug: entity.routeSlug ?? undefined,
				hide: entity.hide,
			});
		}
	}
	return buildSections(stubs, {
		sections: config.sectionsDeclared ? config.sections : undefined,
		home: config.home,
	});
}

/** Copy the built shell into each route directory. */
async function emitRoutePages(map: SectionMap, cwd: string): Promise<number> {
	const shell = await readFile(resolve(cwd, 'dist/index.html'), 'utf-8');
	// Every doc route, plus the always-present /about page.
	const keys = [...map.routes.keys(), 'about'];
	for (const key of keys) {
		const dir = resolve(cwd, 'dist', key);
		await mkdir(dir, { recursive: true });
		await writeFile(resolve(dir, 'index.html'), shell);
	}
	// A 404 that boots the app: static hosts (GitHub Pages) serve it for any
	// unmatched path, so an unknown deep link still loads the shell and lands
	// on the home/about screen instead of a bare 404.
	await writeFile(resolve(cwd, 'dist/404.html'), shell);
	return keys.length;
}
