import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { generateBuildFiles, cleanBuildFiles } from '../server/app-gen.js';
import { discoverDocFiles } from '../server/discovery.js';
import { parseSdoc } from '../language/index.js';
import { planEntitySnippets } from '../server/doc-model.js';
import { buildSections } from '../explorer/tree-builder.js';
import type { DocEntry, ResolvedSdocsConfig } from '../types.js';
import { svelteDedupe } from './dev.js';

export async function buildCommand(): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	console.log('[sdocs] Building static site...');

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
			build: {
				outDir: resolve(cwd, 'dist'),
				emptyOutDir: true,
				rollupOptions: {
					input: inputs,
				},
			},
		});

		// History routing: every route gets a physical index.html (a copy of the
		// shell — asset URLs are root-absolute), so deep links work on any
		// static host with no rewrite rules.
		if ((config.routing ?? 'history') === 'history') {
			const count = await emitRoutePages(config, cwd);
			console.log(`[sdocs] Emitted ${count} route page(s)`);
		}

		console.log(`[sdocs] Build complete → dist/`);
	} finally {
		await cleanBuildFiles(sdocsDir);
	}
}

/** Re-derive the route map from the doc files and copy the shell into each route. */
async function emitRoutePages(config: ResolvedSdocsConfig, cwd: string): Promise<number> {
	const files = await discoverDocFiles(config.include, cwd);
	const stubs: DocEntry[] = [];
	for (const filePath of files) {
		const doc = parseSdoc(await readFile(filePath, 'utf-8'));
		for (const entity of doc.entities) {
			stubs.push({
				kind: entity.kind === 'DOCS' ? 'component' : entity.kind === 'PAGE' ? 'page' : 'layout',
				filePath,
				entitySlug: entity.slug,
				meta: { title: entity.title },
				previews: [],
				examples:
					entity.kind === 'DOCS'
						? planEntitySnippets(entity)
								.filter((s) => s.role === 'example')
								.map((s) => ({ name: s.name, slug: s.slug, role: s.role, body: '' }))
						: [],
				content: null,
			});
		}
	}

	const map = buildSections(stubs, config.sidebar, {
		defaultSection: config.defaultSection,
		order: config.sections,
	});
	const shell = await readFile(resolve(cwd, 'dist/index.html'), 'utf-8');
	// Every doc route, plus the always-present /about page.
	const keys = [...map.routes.keys(), 'about'];
	for (const key of keys) {
		const dir = resolve(cwd, 'dist', key);
		await mkdir(dir, { recursive: true });
		await writeFile(resolve(dir, 'index.html'), shell);
	}
	return keys.length;
}
