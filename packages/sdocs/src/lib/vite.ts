import type { Plugin, ViteDevServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { loadRawConfig, resolveAndFinalize } from './server/config.js';
import { discoverDocFiles } from './server/discovery.js';
import { parseComponent } from './server/prop-parser.js';
import { parseSdoc, offsetToPosition } from './language/index.js';
import {
	planEntitySnippets,
	extractImports,
	resolveComponentImport,
} from './server/doc-model.js';
import { renderPageMarkdown } from './server/page-markdown.js';
import { highlight, disposeHighlighter } from './server/highlighter.js';
import {
	parseIframeId,
	parseMountId,
	parsePageId,
	parsePreviewUrl,
	resolveScriptImports,
	generateIframeComponent,
	generateMountScript,
	generatePageComponent,
	generatePreviewHtml,
	generateStaticPreviewHtml,
	iframeVirtualId,
	mountVirtualId,
	pageVirtualId,
	previewUrl,
	buildPreviewUrl,
	encodeEntityId,
	entityKey,
	setDocPathRoot,
	type StaticCssLink,
} from './server/snippet-compiler.js';
import type {
	SdocsConfig,
	ResolvedSdocsConfig,
	DocEntry,
	ExtractedSnippet,
	ComponentData,
} from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:sdocs';
const RESOLVED_VIRTUAL_ID = '\0virtual:sdocs';
const IFRAME_PREFIX = '/@sdocs/iframe/';
const PREVIEW_PREFIX = '/@sdocs/preview/';
const MOUNT_PREFIX = '/@sdocs/mount/';
const PAGE_PREFIX = '/@sdocs/page/';

interface PlannedPreview {
	jsFileName: string;
	htmlFileName: string;
}

/** Every iframe-served snippet of an entry, in order. A PAGE's content
 * renders natively in the Explorer (via pageModules), never as an iframe. */
function allSnippets(entry: DocEntry): ExtractedSnippet[] {
	return [
		...entry.previews.map((p) => p.snippet),
		...entry.examples,
		...(entry.content && entry.kind !== 'page' ? [entry.content] : []),
	];
}

export function sdocsPlugin(userConfig?: SdocsConfig & { _buildMode?: boolean }): Plugin {
	let config: ResolvedSdocsConfig;
	let root: string;
	let server: ViteDevServer;
	let docEntries: Map<string, DocEntry> = new Map();
	let docScriptCache: Map<string, string> = new Map();
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

				const entry = docEntries.get(entityKey(parsed.docFilePath, parsed.entitySlug));
				if (!entry) {
					res.statusCode = 404;
					res.end('Doc not found');
					return;
				}

				const snippet = allSnippets(entry).find((s) => s.slug === parsed.snippetSlug);
				if (!snippet) {
					res.statusCode = 404;
					res.end('Snippet not found');
					return;
				}

				const iframeId = iframeVirtualId(parsed.docFilePath, parsed.entitySlug, snippet.slug);
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
					deleteEntriesOf(filePath);
					docScriptCache.delete(filePath);
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
					const encoded = encodeEntityId(entry.filePath, entry.entitySlug);
					for (const snippet of allSnippets(entry)) {
						const jsFileName = `previews/${encoded}/${snippet.slug}.js`;
						this.emitFile({
							type: 'chunk',
							id: mountVirtualId(entry.filePath, entry.entitySlug, snippet.slug),
							fileName: jsFileName,
						});
						plannedPreviews.push({
							jsFileName,
							htmlFileName: `previews/${encoded}/${snippet.slug}.html`,
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

				// The HTML sits at previews/<entity>/<name>.html — two levels deep.
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
			if (id.startsWith(PAGE_PREFIX)) return '\0' + id;
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

				const entry = docEntries.get(entityKey(parsed.docFilePath, parsed.entitySlug));
				if (!entry) return null;

				const snippet = allSnippets(entry).find((s) => s.slug === parsed.snippetSlug);
				if (!snippet) return null;

				const scriptPrelude = docScriptCache.get(parsed.docFilePath) ?? '';
				// Method calls and live state bind to the snippet's own preview;
				// example iframes fall back to the first preview's component.
				const preview =
					entry.previews.find((p) => p.snippet.slug === snippet.slug) ?? entry.previews[0];
				const stateNames = (preview?.componentData?.state ?? []).map((s) => s.name);
				return generateIframeComponent(
					scriptPrelude,
					snippet.body,
					stateNames,
					preview?.componentName ?? undefined,
					snippet.stage,
				);
			}

			// Virtual native content component for a PAGE entity
			if (id.startsWith('\0' + PAGE_PREFIX)) {
				const parsed = parsePageId(id.slice(1));
				if (!parsed) return null;
				const entry = docEntries.get(entityKey(parsed.docFilePath, parsed.entitySlug));
				if (!entry?.content) return null;
				const scriptPrelude = docScriptCache.get(parsed.docFilePath) ?? '';
				return generatePageComponent(scriptPrelude, entry.content.body);
			}

			// Virtual mount script for an emitted preview page
			if (id.startsWith('\0' + MOUNT_PREFIX)) {
				const parsed = parseMountId(id.slice(1));
				if (!parsed) return null;
				return generateMountScript(
					iframeVirtualId(parsed.docFilePath, parsed.entitySlug, parsed.snippetSlug),
				);
			}
		},

		async buildEnd() {
			await disposeHighlighter();
		},
	};

	// ─── Process a single doc file ───

	async function processDocFile(filePath: string): Promise<void> {
		try {
			await processDocFileInner(filePath);
		} catch (err) {
			// A half-written file must never kill the dev server.
			console.warn(`[sdocs] Failed to process ${filePath}:`, err);
		}
	}

	async function processDocFileInner(filePath: string): Promise<void> {
		const source = await readFile(filePath, 'utf-8');
		const doc = parseSdoc(source);

		for (const d of doc.diagnostics) {
			const pos = offsetToPosition(source, d.span.start);
			console.warn(`[sdocs] ${filePath}:${pos.line + 1}:${pos.column + 1} — ${d.message}`);
		}

		deleteEntriesOf(filePath);

		const scriptContent = doc.script?.content ?? '';
		const imports = extractImports(scriptContent);
		docScriptCache.set(filePath, resolveScriptImports(scriptContent, filePath));

		// One component parse per component file per rebuild, however many
		// previews reference it.
		const componentCache = new Map<
			string,
			{ data: ComponentData | null; highlighted: string | null }
		>();
		const loadComponent = async (componentPath: string) => {
			let cached = componentCache.get(componentPath);
			if (!cached) {
				cached = { data: null, highlighted: null };
				try {
					cached.data = await parseComponent(componentPath);
					const componentSource = await readFile(componentPath, 'utf-8');
					cached.highlighted = await highlight(componentSource);
				} catch (err) {
					console.warn(`[sdocs] Failed to parse component: ${componentPath}`, err);
				}
				componentCache.set(componentPath, cached);
			}
			return cached;
		};

		for (const entity of doc.entities) {
			const planned = planEntitySnippets(entity);
			const snippets: ExtractedSnippet[] = planned.map((p) => ({
				name: p.name,
				slug: p.slug,
				role: p.role,
				body: p.body,
			}));

			const entry: DocEntry = {
				kind: entity.kind === 'DOCS' ? 'component' : entity.kind === 'PAGE' ? 'page' : 'layout',
				filePath,
				entitySlug: entity.slug,
				meta: { title: entity.title },
				previews: [],
				examples: [],
				content: null,
			};

			// Sizing cascade: block attribute -> entity attribute -> config default.
			const kindKey = entity.kind === 'DOCS' ? 'docs' : entity.kind === 'PAGE' ? 'page' : 'layout';
			const kindDefaults = config.content[kindKey];
			const stageOf = (block?: {
				maxWidth: string | null;
				padding: string | null;
				direction: string | null;
				gap: string | null;
				contentX: string | null;
				contentY: string | null;
			}) => ({
				// Entity-level maxWidth on DOCS/PAGE is the content column, not the
				// stage; stages inside them span their panel unless the block says so.
				maxWidth:
					block?.maxWidth ??
					(entity.kind === 'LAYOUT' ? (entity.sizing.maxWidth ?? kindDefaults.maxWidth) : '100%'),
				padding: block?.padding ?? entity.sizing.padding ?? kindDefaults.padding,
				// direction/gap/contentX flex the preview/example stages only
				...(entity.kind === 'DOCS' && block
					? {
							direction:
								block.direction ?? entity.sizing.direction ?? config.content.docs.direction,
							gap: block.gap ?? entity.sizing.gap ?? config.content.docs.gap,
							contentX: block.contentX ?? entity.sizing.contentX ?? config.content.docs.contentX,
							contentY: block.contentY ?? entity.sizing.contentY ?? config.content.docs.contentY,
						}
					: {}),
			});
			entry.maxWidth = entity.sizing.maxWidth ?? kindDefaults.maxWidth;
			if (entity.kind === 'PAGE') {
				entry.showToc = entity.sizing.toc ?? config.content.page.toc;
			}

			if (entity.kind === 'DOCS') {
				if (entity.description) entry.meta.description = entity.description;
				for (const [i, preview] of entity.previews.entries()) {
					const snippet = snippets[i];
					let componentPath: string | null = null;
					let componentData: ComponentData | null = null;
					let highlightedSource: string | null = null;
					if (preview.componentName) {
						componentPath = resolveComponentImport(preview.componentName, imports, filePath);
						if (componentPath) {
							const loaded = await loadComponent(componentPath);
							componentData = loaded.data;
							highlightedSource = loaded.highlighted;
						} else {
							console.warn(
								`[sdocs] ${filePath}: component {${preview.componentName}} is not imported in the file's <script>`,
							);
						}
					}
					snippet.stage = stageOf(preview.sizing);
					snippet.highlightedHtml = await highlight(snippet.body);
					entry.previews.push({
						label: preview.label,
						componentName: preview.componentName,
						componentPath,
						componentData,
						highlightedSource,
						args: preview.args ?? {},
						snippet,
					});
				}
				entry.examples = snippets.filter((s) => s.role === 'example');
				entity.examples.forEach((example, i) => {
					if (entry.examples[i]) entry.examples[i].stage = stageOf(example.sizing);
				});
				for (const example of entry.examples) {
					example.highlightedHtml = await highlight(example.body);
				}
			} else if (entity.kind === 'PAGE') {
				// The page body renders natively in the Explorer; only its
				// [example] blocks are staged in iframes (with the project css),
				// cascading block attributes over the content.docs stage defaults.
				const rendered = await renderPageMarkdown(entity.body);
				snippets[0].body = rendered.html;
				entry.content = snippets[0];
				entry.toc = rendered.toc;
				entry.padding = entity.sizing.padding ?? config.content.page.padding;
				entry.contentX = entity.sizing.contentX ?? config.content.page.contentX;
				entry.bodyTitle = rendered.bodyTitle;
				entry.contentKey = encodeEntityId(filePath, entity.slug);
				entry.home = entity.home;
				entry.examples = snippets.filter((s) => s.role === 'example');
				entity.examples.forEach((example, i) => {
					if (entry.examples[i]) {
						entry.examples[i].stage = {
							maxWidth: example.sizing.maxWidth ?? '100%',
							padding: example.sizing.padding ?? config.content.docs.padding,
							direction: example.sizing.direction ?? config.content.docs.direction,
							gap: example.sizing.gap ?? config.content.docs.gap,
							contentX: example.sizing.contentX ?? config.content.docs.contentX,
							contentY: example.sizing.contentY ?? config.content.docs.contentY,
						};
					}
				});
				for (const example of entry.examples) {
					example.highlightedHtml = await highlight(example.body);
				}
			} else {
				snippets[0].stage = stageOf();
				entry.content = snippets[0];
			}

			docEntries.set(entityKey(filePath, entity.slug), entry);
		}
	}

	// ─── Generate the virtual module ───

	function generateVirtualModule(): string {
		const urlFor = (entry: DocEntry, snippet: ExtractedSnippet): string =>
			// Only absolute bases prefix here; SvelteKit builds with a relative
			// base ('./') and passes its real path via the Explorer's previewBase.
			(base.startsWith('/') && base !== '/' ? base.replace(/\/$/, '') : '') +
			(buildMode || isBuild
				? buildPreviewUrl(entry.filePath, entry.entitySlug, snippet.slug)
				: previewUrl(entry.filePath, entry.entitySlug, snippet.slug));

		const withUrl = (entry: DocEntry, snippet: ExtractedSnippet) => ({
			...snippet,
			previewUrl: urlFor(entry, snippet),
		});

		const data = Array.from(docEntries.values()).map((e) => ({
			kind: e.kind,
			filePath: e.filePath,
			entitySlug: e.entitySlug,
			meta: e.meta,
			previews: e.previews.map((p) => ({ ...p, snippet: withUrl(e, p.snippet) })),
			examples: e.examples.map((s) => withUrl(e, s)),
			// Page content renders natively (no iframe URL); see pageModules below.
			content: e.content ? (e.kind === 'page' ? e.content : withUrl(e, e.content)) : null,
			toc: e.toc,
			maxWidth: e.maxWidth,
			padding: e.padding,
			contentX: e.contentX,
			showToc: e.showToc,
			bodyTitle: e.bodyTitle,
			contentKey: e.contentKey,
			home: e.home,
		}));
		// Extract named CSS stylesheet names (empty array if single string or null)
		const cssNames = config.css && typeof config.css === 'object'
			? Object.keys(config.css)
			: [];

		// Native page components, as static dynamic imports so every mode (dev,
		// embedded build, CLI build) code-splits them through the module graph —
		// shared Svelte runtime, component CSS handled by Vite's import helper.
		const pageImports = Array.from(docEntries.values())
			.filter((e) => e.kind === 'page')
			.map(
				(e) =>
					`\t${JSON.stringify(encodeEntityId(e.filePath, e.entitySlug))}: () => import(${JSON.stringify(
						pageVirtualId(e.filePath, e.entitySlug),
					)}),`,
			)
			.join('\n');

		return `export const docs = ${JSON.stringify(data)};\nexport const cssNames = ${JSON.stringify(cssNames)};\nexport const pageModules = {\n${pageImports}\n};\nexport default docs;`;
	}

	// ─── HMR helpers ───

	function invalidateVirtualModule(docFilePath?: string) {
		if (!server) return;
		const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
		if (mod) {
			server.moduleGraph.invalidateModule(mod);
		}

		// Also invalidate iframe and page virtual modules for the changed doc file
		if (docFilePath) {
			for (const entry of entriesOf(docFilePath)) {
				for (const snippet of allSnippets(entry)) {
					const iframeId =
						'\0' + iframeVirtualId(docFilePath, entry.entitySlug, snippet.slug);
					const iframeMod = server.moduleGraph.getModuleById(iframeId);
					if (iframeMod) {
						server.moduleGraph.invalidateModule(iframeMod);
					}
				}
				if (entry.kind === 'page') {
					const pageMod = server.moduleGraph.getModuleById(
						'\0' + pageVirtualId(docFilePath, entry.entitySlug),
					);
					if (pageMod) {
						server.moduleGraph.invalidateModule(pageMod);
					}
				}
			}
		}

		server.ws.send({ type: 'full-reload' });
	}

	function isDocFile(filePath: string): boolean {
		return filePath.endsWith('.sdoc');
	}

	function entriesOf(filePath: string): DocEntry[] {
		const entries: DocEntry[] = [];
		for (const [key, entry] of docEntries) {
			if (key.startsWith(filePath + '#')) entries.push(entry);
		}
		return entries;
	}

	function deleteEntriesOf(filePath: string): void {
		for (const key of [...docEntries.keys()]) {
			if (key.startsWith(filePath + '#')) docEntries.delete(key);
		}
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
			if (entry.previews.some((p) => p.componentPath === filePath)) return true;
		}
		return false;
	}

	async function reprocessComponentEntries(componentPath: string): Promise<void> {
		const files = new Set<string>();
		for (const entry of docEntries.values()) {
			if (entry.previews.some((p) => p.componentPath === componentPath)) {
				files.add(entry.filePath);
			}
		}
		for (const file of files) {
			await processDocFile(file);
		}
	}
}
