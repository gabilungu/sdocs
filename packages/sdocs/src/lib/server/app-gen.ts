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
import { encodeEntityId, generatePreviewHtml, setDocPathRoot } from './snippet-compiler.js';
import { describeStages, type StageDescriptor } from './preview-runtime.js';

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
 * Make the staging dir self-sufficient: the staged Explorer imports shiki and
 * marked (and svelte) as bare specifiers, but when the staging dir sits inside
 * a bare project (npx run, no local install), walking up never reaches sdocs'
 * own dependency tree. Link what the Explorer needs into the staging dir's
 * node_modules — svelte only when the project has no copy of its own, so a
 * project-local svelte keeps winning (two svelte runtimes don't mix).
 */
async function linkStagedDeps(sdocsDir: string, cwd: string): Promise<void> {
	const nodeModules = resolve(sdocsDir, 'node_modules');
	await mkdir(nodeModules, { recursive: true });
	const link = async (pkg: string) => {
		const target = packageRoot(pkg);
		if (!target) return;
		await symlink(target, resolve(nodeModules, pkg), 'junction').catch(() => {});
	};
	await link('shiki');
	// Descriptions render inline markdown in the browser, so marked is a client
	// dependency as well as a build-time one.
	await link('marked');
	await link('esm-env');
	try {
		require.resolve('svelte/package.json', { paths: [cwd] });
	} catch {
		await link('svelte');
	}
}

/**
 * Where a package physically lives, for symlinking into the staging tree.
 *
 * `require.resolve('pkg/package.json')` is the direct route, but a package may not
 * EXPORT './package.json' — esm-env doesn't — and then it throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED. So fall back to resolving the entry point and walking
 * up to the directory that owns a package.json. Returns null rather than throwing:
 * failing to link one optional dependency must not stop the server booting.
 */
function packageRoot(pkg: string): string | null {
	try {
		return dirname(require.resolve(`${pkg}/package.json`));
	} catch {
		// Not exported — find the root from the entry instead.
	}
	try {
		let dir = dirname(require.resolve(pkg));
		for (let depth = 0; depth < 8; depth += 1) {
			if (existsSync(join(dir, 'package.json'))) return dir;
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	} catch {
		// Not installed at all.
	}
	return null;
}

/** Source Explorer directory in the installed package (dist/explorer, next to dist/server) */
function getExplorerSourceDir(): string {
	return resolve(__dirname, '../explorer');
}

/**
 * Runtime modules the Explorer imports that live beside it rather than under
 * `explorer/`, because the parser imports them too.
 *
 * Only *runtime* ones: `types.js` is not here because the Explorer imports
 * types from it, which erase at compile time and need no file in the staging
 * tree. A module added here that nothing imports is dead weight; one missing
 * is a "Failed to resolve import" the moment a staged app boots.
 */
const SHARED_MODULES = ['note-order.js', 'slug.js'];

/** Copy the Explorer app plus the ui/ tree it imports (styles, fonts,
 * components), the grammar the client highlighter loads for sdoc fences, and
 * the shared modules above. */
async function copyExplorerApp(sdocsDir: string): Promise<void> {
	await copyDir(getExplorerSourceDir(), resolve(sdocsDir, 'explorer'));
	await copyDir(resolve(__dirname, '../ui'), resolve(sdocsDir, 'ui'));
	await copyDir(resolve(__dirname, '../grammar'), resolve(sdocsDir, 'grammar'));
	for (const name of SHARED_MODULES) {
		await copyFile(resolve(__dirname, '..', name), resolve(sdocsDir, name));
	}
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
	const parent = nodeModules ? join(nodeModules, '.cache') : tmpdir();
	if (nodeModules) await mkdir(parent, { recursive: true });

	await sweepAbandonedStagingDirs(parent);
	const dir = await mkdtemp(join(parent, 'sdocs-'));
	// The owner's pid, so a later run can tell an abandoned directory from a live one.
	await writeFile(join(dir, OWNER_FILE), String(process.pid), 'utf-8');
	return dir;
}

const OWNER_FILE = '.sdocs-owner';

/**
 * Remove staging directories whose owner is gone. A killed dev server (or a crash)
 * never reaches cleanBuildFiles, so these otherwise accumulate one per run — four of
 * them, ~3.5 MB, had piled up in one project before this existed.
 *
 * Liveness is decided by the recorded pid, NOT by age: two sdocs servers on different
 * ports are a normal thing to run, and sweeping by mtime would delete the other one's
 * directory out from under it. A directory with no pid file predates this and is
 * treated as abandoned; anything unreadable is left alone, since deleting what we
 * cannot explain is the worse failure.
 */
async function sweepAbandonedStagingDirs(parent: string): Promise<void> {
	let entries: string[];
	try {
		entries = await readdir(parent);
	} catch {
		return;
	}
	await Promise.all(
		entries
			.filter((name) => name.startsWith('sdocs-'))
			.map(async (name) => {
				const dir = join(parent, name);
				try {
					const pid = Number.parseInt(await readFile(join(dir, OWNER_FILE), 'utf-8'), 10);
					if (Number.isFinite(pid) && isAlive(pid)) return;
				} catch {
					// No owner file: an older sdocs made it, so nothing is watching it now.
				}
				await rm(dir, { recursive: true, force: true }).catch(() => {});
			})
	);
}

/** Signal 0 tests for existence without delivering anything. */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// EPERM means it exists and belongs to someone else — still alive.
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
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
 * builds and prerenders always pass false.
 *
 * `dev` marks the same boot but without the config's say: the note editor
 * writes to project source through an endpoint only the dev server mounts, so
 * the button that opens it must never reach a build, whatever `mcp` is set
 * to. */
function explorerPropsJs(
	config: ResolvedSdocsConfig,
	basePath: string,
	mcp: boolean,
	dev = false,
): string {
	return `{
	docs,
	cssNames,
	pageModules,
	loadChangelog,
	title: ${JSON.stringify(config.title)},
	logo: ${JSON.stringify(config.logo)},
	sections: ${JSON.stringify(config.sectionsDeclared ? config.sections : [])},
	home: ${JSON.stringify(config.home)},
	routing: ${JSON.stringify(config.routing ?? 'history')},
	basePath: ${JSON.stringify(basePath)},
	sdocsVersion: ${JSON.stringify(sdocsVersion())},
	mcp: ${JSON.stringify(mcp)},
	dev: ${JSON.stringify(dev)},
	axes: ${JSON.stringify(config.axes)},
	scale: ${JSON.stringify(config.scale)},
}`;
}

/** Generate the entry.js that boots the Explorer. `basePath` prefixes
 * history routes — set for a `sdocs build` under a sub-path, '' for dev.
 * A prerendered page (static build output) hydrates; the router initializes
 * and the route's content component resolves BEFORE the first client render,
 * so it matches the server HTML. A bare shell (dev) simply mounts. */
function generateEntryJs(config: ResolvedSdocsConfig, basePath: string, mcp = false, dev = false): string {
	return `import { mount, hydrate } from 'svelte';
import { docs, cssNames, pageModules, loadChangelog } from 'virtual:sdocs';
import Explorer from './explorer/Explorer.svelte';
import { initRouter, getRoute } from './explorer/router.svelte.js';
import { buildSections, resolveRoute } from './explorer/tree-builder.js';

const props = ${explorerPropsJs(config, basePath, mcp, dev)};

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
		// Every natively-compiled body on this route: the doc/page content and
		// each [PROSE] block. One missing here is a hydration mismatch — the
		// static HTML has it and the first client render would not.
		const doc = resolveRoute(map, getRoute())?.doc;
		const keys = [doc?.contentKey, ...(doc?.prose ?? []).map((p) => p.key)].filter(Boolean);
		for (const key of keys) {
			if (pageModules[key]) preloaded[key] = (await pageModules[key]()).default;
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
import { docs, cssNames, pageModules, loadChangelog } from 'virtual:sdocs';
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

/** Discover doc files and plan snippet slugs per entity (lightweight, no highlighting) */
async function discoverSnippets(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<Array<{ filePath: string; entitySlug: string; stages: StageDescriptor[] }>> {
	const files = await discoverDocFiles(config.include, cwd);
	const results: Array<{ filePath: string; entitySlug: string; stages: StageDescriptor[] }> = [];

	for (const filePath of files) {
		const source = await readFile(filePath, 'utf-8');
		const doc = parseSdoc(source);
		for (const entity of doc.entities) {
			results.push({
				filePath,
				entitySlug: entity.slug,
				// Iframe pages only: DOC and PAGE content compiles natively in the Explorer.
				stages: describeStages(entity, planIframeSnippets(entity), filePath),
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
	await writeFile(resolve(sdocsDir, 'entry.js'), generateEntryJs(config, '', config.mcp, true));

	return sdocsDir;
}

/** Generate the staging directory with entry + preview HTML files for build mode */
export async function generateBuildFiles(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<{ sdocsDir: string; inputs: Record<string, string> }> {
	const sdocsDir = await createStagingDir(cwd);
	// Encode doc paths against the project — the same root the plugin, the dev
	// server, and both MCP transports use — so these inputs match the URLs
	// generated later and the tokens any tool hands out.
	setDocPathRoot(cwd);

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

	for (const { filePath, entitySlug, stages } of docSnippets) {
		const encoded = encodeEntityId(filePath, entitySlug);
		for (const stage of stages) {
			const iframeId = `/@sdocs/iframe/${encoded}/${stage.slug}.svelte`;
			const previewDir = resolve(sdocsDir, 'previews', encoded);
			await mkdir(previewDir, { recursive: true });

			const previewPath = resolve(previewDir, `${stage.slug}.html`);
			await writeFile(previewPath, generatePreviewHtml(iframeId, config.css, config.base, stage));

			const inputKey = `preview-${encoded}-${stage.slug}`;
			inputs[inputKey] = previewPath;
		}
	}

	return { sdocsDir, inputs };
}

/** Remove a staging directory created by generateDevFiles/generateBuildFiles */
export async function cleanBuildFiles(stagingDir: string): Promise<void> {
	await rm(stagingDir, { recursive: true, force: true });
}

/** Internals exposed for tests only. */
export const __testing = { sweepAbandonedStagingDirs };
