import { mkdir, mkdtemp, writeFile, rm, readFile, copyFile, readdir, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { ResolvedSdocsConfig } from '../types.js';
import { discoverDocFiles } from './discovery.js';
import { parseSdoc } from '../language/index.js';
import { planIframeSnippets } from './doc-model.js';
import { encodeEntityId, setDocPathRoot } from './snippet-compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** The sdocs package version (this file sits at dist/server, package.json two up). */
export function sdocsVersion(): string {
	try {
		return require('../../package.json').version as string;
	} catch {
		return '';
	}
}

/**
 * Make the staging dir self-sufficient: the staged Explorer imports shiki
 * (and svelte) as bare specifiers, but when the staging dir sits inside a
 * bare project (npx run, no local install), walking up never reaches sdocs'
 * own dependency tree. Link what the Explorer needs into the staging dir's
 * node_modules — svelte only when the project has no copy of its own, so a
 * project-local svelte keeps winning (two svelte runtimes don't mix).
 */
async function linkStagedDeps(sdocsDir: string, cwd: string): Promise<void> {
	const nodeModules = resolve(sdocsDir, 'node_modules');
	await mkdir(nodeModules, { recursive: true });
	const link = async (pkg: string) => {
		const target = dirname(require.resolve(`${pkg}/package.json`));
		await symlink(target, resolve(nodeModules, pkg), 'junction').catch(() => {});
	};
	await link('shiki');
	try {
		require.resolve('svelte/package.json', { paths: [cwd] });
	} catch {
		await link('svelte');
	}
}

/** Source Explorer directory in the installed package (dist/explorer, next to dist/server) */
function getExplorerSourceDir(): string {
	return resolve(__dirname, '../explorer');
}

/** Copy the Explorer app plus the ui/ tree it imports (styles, fonts,
 * components) and the grammar the client highlighter loads for sdoc fences. */
async function copyExplorerApp(sdocsDir: string): Promise<void> {
	await copyDir(getExplorerSourceDir(), resolve(sdocsDir, 'explorer'));
	await copyDir(resolve(__dirname, '../ui'), resolve(sdocsDir, 'ui'));
	await copyDir(resolve(__dirname, '../grammar'), resolve(sdocsDir, 'grammar'));
}

/** Nearest node_modules walking up from dir (mirrors Node's resolution) */
function findNearestNodeModules(dir: string): string | null {
	let current = resolve(dir);
	for (;;) {
		const candidate = join(current, 'node_modules');
		if (existsSync(candidate)) return candidate;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

/**
 * Create a unique staging directory for the generated app. It lives inside
 * node_modules/.cache — never a tracked file in the user's project — and being
 * physically inside node_modules keeps the full walk-up resolution chain for
 * bare imports (svelte, ...) intact, including hoisted monorepo setups. When
 * no node_modules exists anywhere (running via npx in a bare folder), sdocs'
 * own tree provides one; the OS temp dir is the last resort.
 */
async function createStagingDir(cwd: string): Promise<string> {
	const nodeModules =
		findNearestNodeModules(cwd) ?? findNearestNodeModules(resolve(__dirname, '..'));
	if (nodeModules) {
		const cacheDir = join(nodeModules, '.cache');
		await mkdir(cacheDir, { recursive: true });
		return mkdtemp(join(cacheDir, 'sdocs-'));
	}
	return mkdtemp(join(tmpdir(), 'sdocs-'));
}

/** Copy a directory recursively */
async function copyDir(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await copyDir(srcPath, destPath);
		} else {
			await copyFile(srcPath, destPath);
		}
	}
}

/** <link rel="icon"> for a favicon path, with the MIME type from its extension.
 * A root-absolute path (a project static asset) is base-prefixed by Vite. */
function faviconLink(favicon: string): string {
	const ext = favicon.split('?')[0].split('.').pop()?.toLowerCase();
	const type =
		ext === 'svg'
			? 'image/svg+xml'
			: ext === 'png'
				? 'image/png'
				: ext === 'ico'
					? 'image/x-icon'
					: null;
	return `<link rel="icon"${type ? ` type="${type}"` : ''} href="${favicon}">`;
}

/** Generate the main index.html */
function generateIndexHtml(title: string, favicon: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	${faviconLink(favicon)}
	<title>${title}</title>
	<style>body { margin: 0; }</style>
</head>
<body>
	<div id="app"></div>
	<script type="module" src="./entry.js"></script>
</body>
</html>`;
}

/** The Explorer props literal shared by the client and server entries.
 * `mcp` is true only for the dev server (which actually serves /mcp) —
 * builds and prerenders always pass false. */
function explorerPropsJs(config: ResolvedSdocsConfig, basePath: string, mcp: boolean): string {
	return `{
	docs,
	cssNames,
	pageModules,
	title: ${JSON.stringify(config.title)},
	logo: ${JSON.stringify(config.logo)},
	sections: ${JSON.stringify(config.sectionsDeclared ? config.sections : [])},
	home: ${JSON.stringify(config.home)},
	routing: ${JSON.stringify(config.routing ?? 'history')},
	basePath: ${JSON.stringify(basePath)},
	sdocsVersion: ${JSON.stringify(sdocsVersion())},
	mcp: ${JSON.stringify(mcp)},
}`;
}

/** Generate the entry.js that boots the Explorer. `basePath` prefixes
 * history routes — set for a `sdocs build` under a sub-path, '' for dev.
 * A prerendered page (static build output) hydrates; the router initializes
 * and the route's content component resolves BEFORE the first client render,
 * so it matches the server HTML. A bare shell (dev) simply mounts. */
function generateEntryJs(config: ResolvedSdocsConfig, basePath: string, mcp = false): string {
	return `import { mount, hydrate } from 'svelte';
import { docs, cssNames, pageModules } from 'virtual:sdocs';
import Explorer from './explorer/Explorer.svelte';
import { initRouter, getRoute } from './explorer/router.svelte.js';
import { buildSections, resolveRoute } from './explorer/tree-builder.js';

const props = ${explorerPropsJs(config, basePath, mcp)};

async function boot() {
	initRouter(props.routing, props.basePath);
	const target = document.getElementById('app');
	const prerendered = target.firstElementChild !== null;
	const preloaded = {};
	if (prerendered) {
		const map = buildSections(docs, {
			sections: props.sections.length > 0 ? props.sections : undefined,
			home: props.home,
		});
		const key = resolveRoute(map, getRoute())?.doc.contentKey;
		if (key && pageModules[key]) {
			preloaded[key] = (await pageModules[key]()).default;
		}
	}
	(prerendered ? hydrate : mount)(Explorer, { target, props: { ...props, preloaded } });
}

boot();`;
}

/** Generate the server entry the static build renders routes through: one
 * render() per route with the router state set explicitly and every content
 * component resolved up front (effects never run server-side). */
function generateServerEntryJs(config: ResolvedSdocsConfig, basePath: string): string {
	return `import { render } from 'svelte/server';
import { docs, cssNames, pageModules } from 'virtual:sdocs';
import Explorer from './explorer/Explorer.svelte';
import { setServerRoute } from './explorer/router.svelte.js';

const props = ${explorerPropsJs(config, basePath, false)};

const preloaded = {};
for (const [key, load] of Object.entries(pageModules)) {
	preloaded[key] = (await load()).default;
}

/** Render one route; returns svelte/server's { head, body }. */
export function renderRoute(segments) {
	setServerRoute(segments, props.basePath);
	return render(Explorer, { props: { ...props, routing: 'history', preloaded } });
}`;
}

/** Generate a preview HTML page for an iframe snippet */
function generatePreviewHtml(
	iframeVirtualId: string,
	css: string | Record<string, string> | null,
	base = '/',
): string {
	const normHref = (href: string) =>
		href.startsWith('http') ? href : href.startsWith('/') ? `/@fs${href}` : '/' + href;

	let cssLinks = '';
	if (css) {
		if (typeof css === 'string') {
			cssLinks = `<link rel="stylesheet" href="${normHref(css)}">`;
		} else {
			const names = Object.keys(css);
			cssLinks = names
				.map(
					(name, i) =>
						`<link rel="stylesheet" href="${normHref(css[name])}" data-sdocs-stylesheet="${name}"${i > 0 ? ' disabled' : ''}>`,
				)
				.join('\n\t');
		}
	}

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<base href="${base}">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	${cssLinks}
	<style>body { margin: 0; }</style>
</head>
<body>
	<div id="app"></div>
	<script type="module">
		import { mount } from 'svelte';
		import Preview from '${iframeVirtualId}';
		mount(Preview, { target: document.getElementById('app') });

		window.addEventListener('message', (e) => {
			if (e.data?.type === 'sdocs:update-stylesheet') {
				const name = e.data.name;
				document.querySelectorAll('link[data-sdocs-stylesheet]').forEach((link) => {
					link.disabled = link.dataset.sdocsStylesheet !== name;
				});
			}
			if (e.data?.type === 'sdocs:scroll-to') {
				const el = document.getElementById(e.data.id);
				if (el) el.scrollIntoView({ behavior: 'smooth' });
			}
		});
	</script>
</body>
</html>`;
}

/** Discover doc files and plan snippet slugs per entity (lightweight, no highlighting) */
async function discoverSnippets(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<Array<{ filePath: string; entitySlug: string; snippetSlugs: string[] }>> {
	const files = await discoverDocFiles(config.include, cwd);
	const results: Array<{ filePath: string; entitySlug: string; snippetSlugs: string[] }> = [];

	for (const filePath of files) {
		const source = await readFile(filePath, 'utf-8');
		const doc = parseSdoc(source);
		for (const entity of doc.entities) {
			results.push({
				filePath,
				entitySlug: entity.slug,
				// Iframe pages only: DOC and PAGE content compiles natively in the Explorer.
				snippetSlugs: planIframeSnippets(entity).map((s) => s.slug),
			});
		}
	}

	return results;
}

/** Generate the staging directory with entry files for dev mode */
export async function generateDevFiles(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<string> {
	const sdocsDir = await createStagingDir(cwd);

	// Copy Explorer components into the staging dir so they're compiled outside node_modules
	await copyExplorerApp(sdocsDir);
	await linkStagedDeps(sdocsDir, cwd);

	await writeFile(resolve(sdocsDir, 'index.html'), generateIndexHtml(config.title, config.favicon));
	// Dev always serves at the root — `base` applies to the build only.
	await writeFile(resolve(sdocsDir, 'entry.js'), generateEntryJs(config, '', config.mcp));

	return sdocsDir;
}

/** Generate the staging directory with entry + preview HTML files for build mode */
export async function generateBuildFiles(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<{ sdocsDir: string; inputs: Record<string, string> }> {
	const sdocsDir = await createStagingDir(cwd);
	// The staging dir becomes the Vite root; encode doc paths against it now so
	// these inputs match the URLs the plugin generates later.
	setDocPathRoot(sdocsDir);

	// Copy Explorer components into the staging dir
	await copyExplorerApp(sdocsDir);
	await linkStagedDeps(sdocsDir, cwd);

	await writeFile(resolve(sdocsDir, 'index.html'), generateIndexHtml(config.title, config.favicon));
	await writeFile(resolve(sdocsDir, 'entry.js'), generateEntryJs(config, config.base));
	// The prerender pass builds and imports this separately (SSR bundle).
	await writeFile(resolve(sdocsDir, 'server-entry.js'), generateServerEntryJs(config, config.base));

	const inputs: Record<string, string> = {
		main: resolve(sdocsDir, 'index.html'),
	};

	// Discover snippets and generate preview HTML pages
	const docSnippets = await discoverSnippets(config, cwd);

	for (const { filePath, entitySlug, snippetSlugs } of docSnippets) {
		const encoded = encodeEntityId(filePath, entitySlug);
		for (const snippetSlug of snippetSlugs) {
			const iframeId = `/@sdocs/iframe/${encoded}/${snippetSlug}.svelte`;
			const previewDir = resolve(sdocsDir, 'previews', encoded);
			await mkdir(previewDir, { recursive: true });

			const previewPath = resolve(previewDir, `${snippetSlug}.html`);
			await writeFile(previewPath, generatePreviewHtml(iframeId, config.css, config.base));

			const inputKey = `preview-${encoded}-${snippetSlug}`;
			inputs[inputKey] = previewPath;
		}
	}

	return { sdocsDir, inputs };
}

/** Remove a staging directory created by generateDevFiles/generateBuildFiles */
export async function cleanBuildFiles(stagingDir: string): Promise<void> {
	await rm(stagingDir, { recursive: true, force: true });
}
