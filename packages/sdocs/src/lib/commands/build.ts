import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig, normalizeBase } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { generateBuildFiles, cleanBuildFiles } from '../server/app-gen.js';
import { discoverDocFiles } from '../server/discovery.js';
import { parseSdoc } from '../language/index.js';
import { planEntitySnippets } from '../server/doc-model.js';
import { buildSections, displayTitle, type SectionMap } from '../explorer/tree-builder.js';
import type { DocEntry, ResolvedSdocsConfig } from '../types.js';
import { svelteDedupe } from './dev.js';

type RenderRoute = (segments: string[]) => { head: string; body: string };

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

		// History routing: every route gets a physical index.html, prerendered —
		// real HTML for crawlers and no-JS readers; the client hydrates on load.
		// Deep links work on any static host with no rewrite rules.
		if ((config.routing ?? 'history') === 'history') {
			console.log('[sdocs] Prerendering routes...');
			const renderRoute = await buildPrerenderer(config, sdocsDir, cwd, absoluteIncludes);
			const count = await emitRoutePages(map, cwd, config, renderRoute);
			console.log(`[sdocs] Prerendered ${count} route page(s)`);
		}

		console.log(`[sdocs] Build complete → dist/`);
	} finally {
		await cleanBuildFiles(sdocsDir);
	}
}

/** Build the SSR bundle of the staged app and return its route renderer.
 * Emitted as .mjs so Node imports it as ESM regardless of the host
 * project's package type. */
async function buildPrerenderer(
	config: ResolvedSdocsConfig,
	sdocsDir: string,
	cwd: string,
	absoluteIncludes: string[],
): Promise<RenderRoute> {
	await build({
		configFile: false,
		root: sdocsDir,
		publicDir: false,
		logLevel: 'warn',
		resolve: {
			dedupe: svelteDedupe(cwd),
		},
		plugins: [
			svelte(),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			sdocsPlugin({ ...config, include: absoluteIncludes, _buildMode: true } as any),
		],
		base: config.base,
		ssr: {
			// Dependencies shipping raw .svelte (icon packs, UI libs) must
			// compile into the bundle — Node can't import .svelte at runtime.
			// svelte itself stays external so one runtime is shared.
			noExternal: true,
			external: ['svelte'],
		},
		build: {
			ssr: resolve(sdocsDir, 'server-entry.js'),
			outDir: resolve(sdocsDir, 'dist-server'),
			emptyOutDir: true,
			rollupOptions: {
				output: { entryFileNames: '[name].mjs' },
			},
		},
	});
	const mod = await import(pathToFileURL(resolve(sdocsDir, 'dist-server/server-entry.mjs')).href);
	return mod.renderRoute as RenderRoute;
}

const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
				meta: {
					title: entity.title,
					...(entity.kind === 'SHOWCASE' && entity.description
						? { description: entity.description }
						: {}),
				},
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

/** Write each route's index.html: the built shell with the route's rendered
 * HTML injected into the app target and a per-route <title> (+ description
 * when the entity has one). A route whose server render throws falls back to
 * the bare shell — the page still works as a SPA — with a warning. */
async function emitRoutePages(
	map: SectionMap,
	cwd: string,
	config: ResolvedSdocsConfig,
	renderRoute: RenderRoute,
): Promise<number> {
	const shell = await readFile(resolve(cwd, 'dist/index.html'), 'utf-8');

	const pageFor = (key: string | null): string => {
		// Tab/tab-title text: "Page – Site" for routes, the site title at the root.
		let title = config.title;
		let description: string | undefined;
		if (key === 'about') {
			title = `About – ${config.title}`;
		} else if (key !== null) {
			const target = map.routes.get(key);
			if (target) {
				const page = displayTitle(target.doc.meta.title);
				title = `${target.snippetName ? `${page} / ${target.snippetName}` : page} – ${config.title}`;
				description = target.doc.meta.description;
			}
		}

		let html = shell;
		try {
			const segments = key === null ? [] : key.split('/');
			const { head, body } = renderRoute(segments);
			html = html.replace(/<div id="app">\s*<\/div>/, `<div id="app">${body}</div>`);
			if (head) html = html.replace('</head>', `${head}\n</head>`);
		} catch (err) {
			console.warn(
				`[sdocs] Prerender failed for /${key ?? ''} — page falls back to client rendering:`,
				err instanceof Error ? err.message : err,
			);
		}
		const headTags =
			`<title>${escapeHtml(title)}</title>` +
			(description ? `\n\t<meta name="description" content="${escapeHtml(description)}">` : '');
		return html.replace(/<title>[^<]*<\/title>/, headTags);
	};

	// The root route renders the home target (or the About screen).
	await writeFile(resolve(cwd, 'dist/index.html'), pageFor(null));

	// Every doc route, plus the always-present /about page.
	const keys = [...map.routes.keys(), 'about'];
	for (const key of keys) {
		const dir = resolve(cwd, 'dist', key);
		await mkdir(dir, { recursive: true });
		await writeFile(resolve(dir, 'index.html'), pageFor(key));
	}
	// A 404 that boots the app: static hosts (GitHub Pages) serve it for any
	// unmatched path, so an unknown deep link still loads the shell and lands
	// on the home/about screen instead of a bare 404. It stays a bare shell —
	// prerendering some other page's content there would mislead crawlers.
	await writeFile(resolve(cwd, 'dist/404.html'), shell);
	return keys.length + 1;
}
