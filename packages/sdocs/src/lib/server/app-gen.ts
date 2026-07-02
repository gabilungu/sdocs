import { mkdir, writeFile, rm, readFile, copyFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedSdocsConfig } from '../types.js';
import { discoverDocFiles, getSdocKind } from './discovery.js';
import { extractSnippets, hasDefaultSnippet } from './snippet-extractor.js';
import { base64urlEncode } from './snippet-compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Source client directory in the installed package (dist/client, next to dist/server) */
function getClientSourceDir(): string {
	return resolve(__dirname, '../client');
}

/** Copy the client app plus the ui/ tree it imports (styles, fonts, components) */
async function copyClientApp(sdocsDir: string): Promise<void> {
	await copyDir(getClientSourceDir(), resolve(sdocsDir, 'client'));
	await copyDir(resolve(__dirname, '../ui'), resolve(sdocsDir, 'ui'));
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

/** Generate the main index.html */
function generateIndexHtml(title: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="icon" type="image/png" href="./client/favicon.png">
	<title>${title}</title>
	<style>body { margin: 0; }</style>
</head>
<body>
	<div id="app"></div>
	<script type="module" src="./entry.js"></script>
</body>
</html>`;
}

/** Generate the entry.js that mounts the App */
function generateEntryJs(config: ResolvedSdocsConfig): string {
	return `import { mount } from 'svelte';
import { docs, cssNames } from 'virtual:sdocs';
import App from './client/App.svelte';

mount(App, {
	target: document.getElementById('app'),
	props: {
		docs,
		cssNames,
		logo: ${JSON.stringify(config.logo)},
		sidebarConfig: ${JSON.stringify(config.sidebar)},
	}
});`;
}

/** Generate a preview HTML page for an iframe snippet */
function generatePreviewHtml(
	iframeVirtualId: string,
	css: string | Record<string, string> | null,
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
	<meta name="viewport" content="width=device-width, initial-scale=1">
	${cssLinks}
	<style>body { margin: 0; }</style>
</head>
<body>
	<div id="app"></div>
	<script type="module">
		import { mount } from 'svelte';
		import App from '${iframeVirtualId}';
		mount(App, { target: document.getElementById('app') });

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

/** Discover doc files and extract snippet names (lightweight, no highlighting) */
async function discoverSnippets(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<Array<{ filePath: string; snippetNames: string[] }>> {
	const files = await discoverDocFiles(config.include, cwd);
	const results: Array<{ filePath: string; snippetNames: string[] }> = [];

	for (const filePath of files) {
		const source = await readFile(filePath, 'utf-8');
		const kind = getSdocKind(filePath);

		if (kind === 'page' || kind === 'layout') {
			results.push({ filePath, snippetNames: ['Content'] });
		} else {
			const snippets = extractSnippets(source);
			const names = snippets.map((s) => s.name);
			if (!hasDefaultSnippet(snippets)) {
				names.unshift('Default');
			}
			results.push({ filePath, snippetNames: names });
		}
	}

	return results;
}

/** Generate .sdocs/ directory with entry files for dev mode */
export async function generateDevFiles(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<string> {
	const sdocsDir = resolve(cwd, '.sdocs');
	await mkdir(sdocsDir, { recursive: true });

	// Copy client components into .sdocs/client/ so they're compiled outside node_modules
	await copyClientApp(sdocsDir);

	await writeFile(resolve(sdocsDir, 'index.html'), generateIndexHtml(config.logo));
	await writeFile(resolve(sdocsDir, 'entry.js'), generateEntryJs(config));

	return sdocsDir;
}

/** Generate .sdocs/ directory with entry + preview HTML files for build mode */
export async function generateBuildFiles(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<{ sdocsDir: string; inputs: Record<string, string> }> {
	const sdocsDir = resolve(cwd, '.sdocs');
	await mkdir(sdocsDir, { recursive: true });

	// Copy client components into .sdocs/client/
	await copyClientApp(sdocsDir);

	await writeFile(resolve(sdocsDir, 'index.html'), generateIndexHtml(config.logo));
	await writeFile(resolve(sdocsDir, 'entry.js'), generateEntryJs(config));

	const inputs: Record<string, string> = {
		main: resolve(sdocsDir, 'index.html'),
	};

	// Discover snippets and generate preview HTML pages
	const docSnippets = await discoverSnippets(config, cwd);

	for (const { filePath, snippetNames } of docSnippets) {
		const encoded = base64urlEncode(filePath);
		for (const snippetName of snippetNames) {
			const iframeId = `/@sdocs/iframe/${encoded}/${snippetName}.svelte`;
			const previewDir = resolve(sdocsDir, 'previews', encoded);
			await mkdir(previewDir, { recursive: true });

			const previewPath = resolve(previewDir, `${snippetName}.html`);
			await writeFile(previewPath, generatePreviewHtml(iframeId, config.css));

			const inputKey = `preview-${encoded}-${snippetName}`;
			inputs[inputKey] = previewPath;
		}
	}

	return { sdocsDir, inputs };
}

/** Remove the .sdocs/ temp directory */
export async function cleanBuildFiles(cwd: string): Promise<void> {
	const sdocsDir = resolve(cwd, '.sdocs');
	await rm(sdocsDir, { recursive: true, force: true });
}
