import type { Plugin, ViteDevServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { loadRawConfig, resolveAndFinalize } from './server/config.js';
import { discoverDocFiles, getSdocKind } from './server/discovery.js';
import { parseDocSource } from './server/meta-parser.js';
import { parseComponent } from './server/prop-parser.js';
import {
	extractSnippets,
	extractMarkupBody,
	hasDefaultSnippet,
	generateAutoDefault,
} from './server/snippet-extractor.js';
import { highlight, disposeHighlighter } from './server/highlighter.js';
import { extractTocFromHtml } from './server/toc-extractor.js';
import {
	parseIframeId,
	parseMountId,
	parsePreviewUrl,
	resolveImportsToAbsolute,
	generateIframeComponent,
	generateMountScript,
	generatePreviewHtml,
	generateStaticPreviewHtml,
	iframeVirtualId,
	mountVirtualId,
	previewUrl,
	buildPreviewUrl,
	encodeDocPath,
	setDocPathRoot,
	type StaticCssLink,
} from './server/snippet-compiler.js';
import type {
	SdocsConfig,
	ResolvedSdocsConfig,
	DocEntry,
	TocHeading,
} from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:sdocs';
const RESOLVED_VIRTUAL_ID = '\0virtual:sdocs';
const IFRAME_PREFIX = '/@sdocs/iframe/';
const PREVIEW_PREFIX = '/@sdocs/preview/';
const MOUNT_PREFIX = '/@sdocs/mount/';

interface PlannedPreview {
	jsFileName: string;
	htmlFileName: string;
}

export function sdocsPlugin(userConfig?: SdocsConfig & { _buildMode?: boolean }): Plugin {
	let config: ResolvedSdocsConfig;
	let root: string;
	let server: ViteDevServer;
	let docEntries: Map<string, DocEntry> = new Map();
	let docImportsCache: Map<string, string[]> = new Map();
	const buildMode = (userConfig as any)?._buildMode ?? false;
	let isBuild = false;
	let isSsrBuild = false;
	// Host app's base path ('/' when served at the domain root); preview URLs
	// are root-absolute and must carry it so embedding works under a sub-path.
	let base = '/';
	// Previews planned for emission into a host app's build (embedded mode)
	let plannedPreviews: PlannedPreview[] = [];
	let emittedCssLinks: StaticCssLink[] = [];

	return {
		name: 'sdocs',

		async configResolved(resolvedConfig) {
			root = resolvedConfig.root;
			setDocPathRoot(root);
			isBuild = resolvedConfig.command === 'build';
			isSsrBuild = !!resolvedConfig.build?.ssr;
			base = resolvedConfig.base || '/';
			const fileConfig = await loadRawConfig(root);
			const merged = { ...fileConfig, ...userConfig };
			config = resolveAndFinalize(merged, root);
		},

		configureServer(devServer) {
			server = devServer;

			// Middleware: serve iframe preview HTML pages
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith(PREVIEW_PREFIX)) return next();

				const parsed = parsePreviewUrl(req.url);
				if (!parsed) return next();

				const entry = docEntries.get(parsed.docFilePath);
				if (!entry) {
					res.statusCode = 404;
					res.end('Doc not found');
					return;
				}

				const snippet = entry.snippets.find((s) => s.name === parsed.snippetName);
				if (!snippet) {
					res.statusCode = 404;
					res.end('Snippet not found');
					return;
				}

				const iframeId = iframeVirtualId(parsed.docFilePath, parsed.snippetName);
				const html = generatePreviewHtml(iframeId, config.css);

				res.setHeader('Content-Type', 'text/html');
				// Let Vite transform the HTML (resolves imports, injects HMR client)
				server.transformIndexHtml(req.url, html).then((transformed) => {
					res.end(transformed);
				}).catch((err) => {
					console.error('[sdocs] Preview HTML transform error:', err);
					res.statusCode = 500;
					res.end('Internal error');
				});
			});

			// Watch for .sdoc file add/unlink/change
			server.watcher.on('add', async (filePath) => {
				if (isDocFile(filePath)) {
					console.log(`[sdocs] New doc file: ${filePath}`);
					await processDocFile(filePath);
					invalidateVirtualModule(filePath);
				}
			});

			server.watcher.on('unlink', (filePath) => {
				if (isDocFile(filePath)) {
					console.log(`[sdocs] Removed doc file: ${filePath}`);
					docEntries.delete(filePath);
					docImportsCache.delete(filePath);
					invalidateVirtualModule();
				}
			});

			server.watcher.on('change', async (filePath) => {
				if (isDocFile(filePath)) {
					console.log(`[sdocs] Doc file changed: ${filePath}`);
					await processDocFile(filePath);
					invalidateVirtualModule(filePath);
				} else if (isComponentReferencedByDoc(filePath)) {
					console.log(`[sdocs] Component changed: ${filePath}`);
					await reprocessComponentEntries(filePath);
					invalidateVirtualModule(filePath);
				}
			});
		},

		async buildStart() {
			const files = await discoverDocFiles(config.include, root);
			console.log(`[sdocs] Discovered ${files.length} doc file(s):`);
			for (const file of files) {
				console.log(`  - ${file}`);
				await processDocFile(file);
			}

			// Explicitly watch doc files and their directories (outside Vite root)
			if (server) {
				const dirs = new Set<string>();
				for (const file of files) {
					server.watcher.add(file);
					dirs.add(file.substring(0, file.lastIndexOf('/')));
				}
				for (const dir of dirs) {
					server.watcher.add(dir);
				}
			}

			// Embedded production build: emit each preview as its own chunk so the
			// host app's build output contains working static preview pages. (The
			// standalone CLI build passes _buildMode and provides HTML inputs itself;
			// the SSR half of an app build has no use for browser preview pages.)
			if (isBuild && !buildMode && !isSsrBuild) {
				plannedPreviews = [];
				emittedCssLinks = [];

				const css = config.css;
				if (typeof css === 'string') {
					emittedCssLinks.push({ href: await emitCssAsset(this, css, 'preview') });
				} else if (css) {
					for (const [i, name] of Object.keys(css).entries()) {
						emittedCssLinks.push({
							href: await emitCssAsset(this, css[name], name),
							name,
							disabled: i > 0,
						});
					}
				}

				for (const entry of docEntries.values()) {
					const encoded = encodeDocPath(entry.filePath);
					for (const snippet of entry.snippets) {
						const jsFileName = `previews/${encoded}/${snippet.name}.js`;
						this.emitFile({
							type: 'chunk',
							id: mountVirtualId(entry.filePath, snippet.name),
							fileName: jsFileName,
						});
						plannedPreviews.push({
							jsFileName,
							htmlFileName: `previews/${encoded}/${snippet.name}.html`,
						});
					}
				}
				console.log(`[sdocs] Emitting ${plannedPreviews.length} static preview page(s)`);
			}
		},

		generateBundle(_options, bundle) {
			for (const preview of plannedPreviews) {
				const chunk = bundle[preview.jsFileName];
				if (!chunk || chunk.type !== 'chunk') continue;

				// Collect CSS emitted for this chunk and everything it imports.
				const cssFiles = new Set<string>();
				const queue = [preview.jsFileName];
				const seen = new Set<string>();
				while (queue.length) {
					const fileName = queue.pop()!;
					if (seen.has(fileName)) continue;
					seen.add(fileName);
					const mod = bundle[fileName];
					if (!mod || mod.type !== 'chunk') continue;
					for (const css of mod.viteMetadata?.importedCss ?? []) cssFiles.add(css);
					queue.push(...mod.imports);
				}

				// The HTML sits at previews/<doc>/<name>.html — two levels deep.
				const cssLinks: StaticCssLink[] = [
					...emittedCssLinks,
					...[...cssFiles].map((file) => ({ href: `../../${file}` })),
				];
				this.emitFile({
					type: 'asset',
					fileName: preview.htmlFileName,
					source: generateStaticPreviewHtml(
						`./${preview.jsFileName.split('/').pop()}`,
						cssLinks,
					),
				});
			}
			plannedPreviews = [];
		},

		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_ID;
			if (id.startsWith(IFRAME_PREFIX)) return '\0' + id;
			if (id.startsWith(MOUNT_PREFIX)) return '\0' + id;
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_ID) {
				return generateVirtualModule();
			}

			// Virtual iframe wrapper component
			if (id.startsWith('\0' + IFRAME_PREFIX)) {
				const realId = id.slice(1);
				const parsed = parseIframeId(realId);
				if (!parsed) return null;

				const entry = docEntries.get(parsed.docFilePath);
				if (!entry) return null;

				const snippet = entry.snippets.find((s) => s.name === parsed.snippetName);
				if (!snippet) return null;

				const absoluteImports = docImportsCache.get(parsed.docFilePath) ?? [];
				return generateIframeComponent(absoluteImports, snippet.body);
			}

			// Virtual mount script for an emitted preview page
			if (id.startsWith('\0' + MOUNT_PREFIX)) {
				const parsed = parseMountId(id.slice(1));
				if (!parsed) return null;
				return generateMountScript(
					iframeVirtualId(parsed.docFilePath, parsed.snippetName),
				);
			}
		},

		async buildEnd() {
			await disposeHighlighter();
		},
	};

	// ─── Process a single doc file ───

	async function processDocFile(filePath: string): Promise<void> {
		const source = await readFile(filePath, 'utf-8');
		const kind = getSdocKind(filePath);

		const parsed = parseDocSource(source, filePath);
		const meta = parsed.meta;
		const componentPath = parsed.componentPath;
		const imports = parsed.imports;
		let snippets;
		let toc: TocHeading[] | undefined;

		if (kind === 'page' || kind === 'layout') {
			const body = extractMarkupBody(source);
			snippets = [{ name: 'Content', body }];
			if (kind === 'page') {
				toc = extractTocFromHtml(body);
			}
		} else {
			snippets = extractSnippets(source);
			if (!hasDefaultSnippet(snippets)) {
				const componentName = componentPath?.split('/').pop()?.replace('.svelte', '') ?? 'Component';
				snippets.unshift({
					name: 'Default',
					body: generateAutoDefault(componentName),
				});
			}
		}

		// If component is specified as a path but not imported, auto-add the import
		if (componentPath) {
			const componentName = componentPath.split('/').pop()?.replace('.svelte', '') ?? 'Component';
			const hasImport = imports.some((imp) => imp.includes(componentName));
			if (!hasImport) {
				imports.push(`import ${componentName} from '${componentPath}'`);
			}
		}

		// Cache resolved imports for iframe component generation
		docImportsCache.set(filePath, resolveImportsToAbsolute(imports, filePath));

		let componentData = null;
		let highlightedSource = null;
		if (kind === 'component' && componentPath) {
			try {
				componentData = await parseComponent(componentPath);
				const componentSource = await readFile(componentPath, 'utf-8');
				highlightedSource = await highlight(componentSource);
			} catch (err) {
				console.warn(`[sdocs] Failed to parse component: ${componentPath}`, err);
			}
		}

		for (const snippet of snippets) {
			snippet.highlightedHtml = await highlight(snippet.body);
		}

		docEntries.set(filePath, {
			kind,
			filePath,
			componentPath,
			meta,
			componentData,
			snippets,
			highlightedSource,
			toc,
		});
	}

	// ─── Generate the virtual module ───

	function generateVirtualModule(): string {
		const entries = Array.from(docEntries.values());
		const data = entries.map((e) => ({
			kind: e.kind,
			filePath: e.filePath,
			componentPath: e.componentPath,
			meta: e.meta,
			componentData: e.componentData,
			snippets: e.snippets.map((s) => ({
				name: s.name,
				body: s.body,
				highlightedHtml: s.highlightedHtml,
				previewUrl:
					// Only absolute bases prefix here; SvelteKit builds with a relative
					// base ('./') and passes its real path via the Explorer's previewBase.
					(base.startsWith('/') && base !== '/' ? base.replace(/\/$/, '') : '') +
					(buildMode || isBuild
						? buildPreviewUrl(e.filePath, s.name)
						: previewUrl(e.filePath, s.name)),
			})),
			highlightedSource: e.highlightedSource,
			toc: e.toc,
		}));
		// Extract named CSS stylesheet names (empty array if single string or null)
		const cssNames = config.css && typeof config.css === 'object'
			? Object.keys(config.css)
			: [];

		return `export const docs = ${JSON.stringify(data)};\nexport const cssNames = ${JSON.stringify(cssNames)};\nexport default docs;`;
	}

	// ─── HMR helpers ───

	function invalidateVirtualModule(docFilePath?: string) {
		if (!server) return;
		const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
		if (mod) {
			server.moduleGraph.invalidateModule(mod);
		}

		// Also invalidate iframe virtual modules for the changed doc file
		if (docFilePath) {
			const entry = docEntries.get(docFilePath);
			if (entry) {
				for (const snippet of entry.snippets) {
					const iframeId = '\0' + iframeVirtualId(docFilePath, snippet.name);
					const iframeMod = server.moduleGraph.getModuleById(iframeId);
					if (iframeMod) {
						server.moduleGraph.invalidateModule(iframeMod);
					}
				}
			}
		}

		server.ws.send({ type: 'full-reload' });
	}

	function isDocFile(filePath: string): boolean {
		return filePath.endsWith('.sdoc');
	}

	/** Emit a user stylesheet as a build asset; returns its href relative to a preview page. */
	async function emitCssAsset(
		ctx: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => string },
		href: string,
		name: string,
	): Promise<string> {
		if (href.startsWith('http')) return href;
		const source = await readFile(href, 'utf-8');
		const fileName = `previews/_css/${name}.css`;
		ctx.emitFile({ type: 'asset', fileName, source });
		return `../../${fileName}`;
	}

	function isComponentReferencedByDoc(filePath: string): boolean {
		for (const entry of docEntries.values()) {
			if (entry.componentPath === filePath) return true;
		}
		return false;
	}

	async function reprocessComponentEntries(componentPath: string): Promise<void> {
		for (const [docPath, entry] of docEntries) {
			if (entry.componentPath === componentPath) {
				await processDocFile(docPath);
			}
		}
	}
}
