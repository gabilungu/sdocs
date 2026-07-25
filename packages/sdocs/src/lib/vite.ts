import type { Plugin, ViteDevServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRawConfig, resolveAndFinalize } from './server/config.js';
import { discoverDocFiles, globBase } from './server/discovery.js';
import { parseComponent } from './server/prop-parser.js';
import { parseSdoc, offsetToPosition } from './language/index.js';
import {
	planEntitySnippets,
	extractImports,
	resolveComponentImport,
} from './server/doc-model.js';
import { stageId, stageIdentity } from './server/preview-runtime.js';
import { resolveStageLayout, type SizingAttrs } from './server/stage-layout.js';
import { renderPageMarkdown, applyBaseToHtml } from './server/page-markdown.js';
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
	lookupEntry,
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

/** Every iframe-served snippet of an entry, in order. DOC and PAGE content
 * renders natively in the Explorer (via pageModules), never as an iframe. */
function allSnippets(entry: DocEntry): ExtractedSnippet[] {
	return [
		...entry.previews.map((p) => p.snippet),
		...entry.examples,
		...(entry.content && entry.kind !== 'doc' && entry.kind !== 'page' ? [entry.content] : []),
	];
}

export function sdocsPlugin(
	userConfig?: (SdocsConfig | ResolvedSdocsConfig) & {
		_buildMode?: boolean;
		/** The project directory. Standalone dev/build run Vite from a staging
		 * dir under node_modules, so the Vite root is NOT the project — and doc
		 * paths encoded against it disagree with every other process that talks
		 * about the same stage. Embedded, the two are the same. */
		_projectRoot?: string;
	},
): Plugin {
	let config: ResolvedSdocsConfig;
	let root: string;
	/** The project directory doc paths encode against (see _projectRoot). */
	let projectRoot: string;
	let server: ViteDevServer;
	let docEntries: Map<string, DocEntry> = new Map();
	let docScriptCache: Map<string, string> = new Map();
	/** The file-level <style> content per doc file — injected into every one
	 * of the file's preview/example stages (and its PAGE/DOC content). */
	let docStyleCache: Map<string, string> = new Map();
	const buildMode = (userConfig as any)?._buildMode ?? false;
	let isBuild = false;
	let isSsrBuild = false;
	// Host app's base path ('/' when served at the domain root); preview URLs
	// are root-absolute and must carry it so embedding works under a sub-path.
	let base = '/';
	// Previews planned for emission into a host app's build (embedded mode)
	let plannedPreviews: PlannedPreview[] = [];
	// Hard diagnostics collected during build (dev only warns; builds fail)
	let buildErrors: string[] = [];
	let emittedCssLinks: StaticCssLink[] = [];

	return {
		name: 'sdocs',

		async configResolved(resolvedConfig) {
			root = resolvedConfig.root;
			// One canonical root for doc paths: the project, never the staging
			// dir. Dev, build, the HTTP MCP server (same process) and a
			// standalone stdio MCP server (its cwd) then all encode the same
			// stage to the same token, so a route or a stage id means one thing
			// wherever it was produced.
			projectRoot = (userConfig as { _projectRoot?: string } | undefined)?._projectRoot ?? root;
			setDocPathRoot(projectRoot);
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

				const entry = lookupEntry(docEntries, parsed);
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

				const iframeId = iframeVirtualId(entry.filePath, entry.entitySlug, snippet.slug);
				const html = generatePreviewHtml(iframeId, config.css, base, {
					id: stageId(stageIdentity(entry.filePath, entry.entitySlug, snippet.slug)),
					kind: snippet.role === 'preview' ? 'component' : snippet.role,
					name: snippet.name,
					component: snippet.componentName ?? null,
				});

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
					// The include roots are watched recursively (see buildStart), so
					// this also fires for docs in brand-new directories — but only
					// files the include globs actually match become entries.
					const files = await discoverDocFiles(config.include, root);
					if (!files.includes(filePath)) return;
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
					docStyleCache.delete(filePath);
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
			buildErrors = [];
			const files = await discoverDocFiles(config.include, root);
			console.log(`[sdocs] Discovered ${files.length} doc file(s):`);
			for (const file of files) {
				console.log(`  - ${file}`);
				await processDocFile(file);
			}
			if (buildErrors.length > 0) {
				throw new Error(`[sdocs] Build failed:\n${buildErrors.join('\n')}`);
			}

			// Explicitly watch doc files and their directories (outside Vite root),
			// plus each include pattern's static root — recursively, so a doc
			// added in a brand-new directory still fires the watcher's `add`.
			if (server) {
				const dirs = new Set<string>();
				for (const file of files) {
					server.watcher.add(file);
					dirs.add(file.substring(0, file.lastIndexOf('/')));
				}
				for (const pattern of config.include) {
					dirs.add(globBase(pattern));
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
						// Full path, not './x.js': the shell's <base> would otherwise
						// re-root a relative src away from the page's own directory.
						`${base}${preview.jsFileName}`,
						cssLinks,
						base,
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
			// `sdocs/ui` from doc-file scripts (e.g. CodeBlock in a [PAGE]) must
			// resolve even in standalone projects where sdocs isn't installed —
			// point it at this package's own copy.
			if (id === 'sdocs/ui') return fileURLToPath(new URL('./ui/index.js', import.meta.url));
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

				const entry = lookupEntry(docEntries, parsed);
				if (!entry) return null;

				const snippet = allSnippets(entry).find((s) => s.slug === parsed.snippetSlug);
				if (!snippet) return null;

				// The scope chain: file script, then the entity's own, both with
				// their relative imports resolved against the doc file.
				const filePrelude = docScriptCache.get(parsed.docFilePath) ?? '';
				const entityPrelude = entry.entityScript
					? resolveScriptImports(entry.entityScript, parsed.docFilePath)
					: '';
				const scriptPrelude = [filePrelude, entityPrelude].filter((s) => s.trim()).join('\n');
				// Method calls and live state bind to the snippet's own preview;
				// example iframes fall back to the first preview's component.
				const preview =
					entry.previews.find((p) => p.snippet.slug === snippet.slug) ?? entry.previews[0];
				const stateNames = (preview?.componentData?.state ?? []).map((s) => s.name);
				// The block's own script (imports resolved like the file's) and the
				// stage CSS: the file <style> shared by every block, plus this block's.
				const blockScript = snippet.script
					? resolveScriptImports(snippet.script, parsed.docFilePath)
					: undefined;
				const styles = [docStyleCache.get(parsed.docFilePath), entry.entityStyle, snippet.style]
					.filter((s): s is string => !!s?.trim())
					.join('\n\n');
				// The stage's own declared args seed the initial state, so a
				// component reading a required prop has it on first render —
				// the Controls' first message only confirms them. Examples
				// declare none.
				const stageArgs =
					entry.previews.find((p) => p.snippet.slug === snippet.slug)?.args ?? undefined;
				return generateIframeComponent(
					scriptPrelude,
					snippet.markup ?? snippet.body,
					stateNames,
					preview?.componentName ?? undefined,
					snippet.stage,
					{ blockScript, styles: styles || undefined, args: stageArgs },
				);
			}

			// Virtual native content component for a DOC or PAGE entity
			if (id.startsWith('\0' + PAGE_PREFIX)) {
				const parsed = parsePageId(id.slice(1));
				if (!parsed) return null;
				const entry = lookupEntry(docEntries, parsed);
				if (!entry?.content) return null;
				const filePrelude = docScriptCache.get(parsed.docFilePath) ?? '';
				const entityPrelude = entry.entityScript
					? resolveScriptImports(entry.entityScript, parsed.docFilePath)
					: '';
				const styles = [docStyleCache.get(parsed.docFilePath), entry.entityStyle]
					.filter((s): s is string => !!s?.trim())
					.join('\n\n');
				return generatePageComponent(
					[filePrelude, entityPrelude].filter((s) => s.trim()).join('\n'),
					entry.content.body,
					styles,
				);
			}

			// Virtual mount script for an emitted preview page
			if (id.startsWith('\0' + MOUNT_PREFIX)) {
				const parsed = parseMountId(id.slice(1));
				if (!parsed) return null;
				const mountEntry = lookupEntry(docEntries, parsed);
				return generateMountScript(
					iframeVirtualId(
						mountEntry?.filePath ?? parsed.docFilePath,
						mountEntry?.entitySlug ?? parsed.entitySlug,
						parsed.snippetSlug,
					),
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
			const where = `${filePath}:${pos.line + 1}:${pos.column + 1}`;
			console.warn(`[sdocs] ${where} — ${d.message}`);
			// A missing example title — or one that isn't a usable string, like
			// title={expr} — is an error in builds: untitled stages would ship
			// with empty headings and colliding slugs.
			if (isBuild && d.code === 'example-title-required') {
				buildErrors.push(`${where} — ${d.message}`);
			}
		}

		deleteEntriesOf(filePath);

		const scriptContent = doc.script?.content ?? '';
		const imports = extractImports(scriptContent);
		docScriptCache.set(filePath, resolveScriptImports(scriptContent, filePath));
		docStyleCache.set(filePath, doc.style?.content ?? '');

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
				markup: p.markup,
				script: p.script,
				style: p.style,
				description: p.description,
				componentName: p.componentName ?? null,
				stageId: stageId(stageIdentity(filePath, entity.slug, p.slug)),
			}));

			const entry: DocEntry = {
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
				entityScript: entity.script?.content ?? null,
				entityStyle: entity.style?.content ?? null,
				previews: [],
				examples: [],
				content: null,
				routeSlug: entity.routeSlug ?? undefined,
				hide: entity.hide,
			};

			// Sizing cascade: block attribute -> entity attribute -> config default.
			const kindDefaults = config.content[
				entity.kind === 'SHOWCASE'
					? 'showcase'
					: entity.kind === 'DOC'
						? 'doc'
						: entity.kind === 'PAGE'
							? 'page'
							: 'layout'
			];
			const stageOf = (block?: SizingAttrs) => resolveStageLayout(entity, block, config);
			entry.maxWidth = entity.sizing.maxWidth ?? kindDefaults.maxWidth;
			if (entity.kind === 'DOC') {
				entry.showToc = entity.sizing.toc ?? config.content.doc.toc;
			}

			if (entity.kind === 'SHOWCASE') {
				if (entity.description) entry.meta.description = entity.description;
				for (const [i, preview] of entity.previews.entries()) {
					const snippet = snippets[i];
					let componentPath: string | null = null;
					let componentData: ComponentData | null = null;
					let highlightedSource: string | null = null;
					if (preview.componentName) {
						// The block's own imports take precedence over the file's —
						// the more local binding wins, matching lexical scoping.
						const blockImports = preview.script ? extractImports(preview.script.content) : [];
						const entityImports = entity.script ? extractImports(entity.script.content) : [];
						componentPath = resolveComponentImport(
							preview.componentName,
							[...blockImports, ...entityImports, ...imports],
							filePath,
						);
						// A path that resolved but names no file is just as broken as
						// one that never resolved — `sdocs check` treats them alike.
						if (componentPath && !existsSync(componentPath)) componentPath = null;
						if (componentPath) {
							const loaded = await loadComponent(componentPath);
							componentData = loaded.data;
							highlightedSource = loaded.highlighted;
						} else {
							const pos = offsetToPosition(source, preview.span.start);
							const where = `${filePath}:${pos.line + 1}:${pos.column + 1}`;
							const message =
								`component={${preview.componentName}} doesn't resolve to a component file — ` +
								"check the import in the file's, the entity's, or the block's <script>.";
							console.warn(`[sdocs] ${where} — ${message}`);
							// The preview would ship as an empty stage. Dev keeps
							// running so the doc can be fixed in place; a build stops.
							if (isBuild) buildErrors.push(`${where} — ${message}`);
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
			} else if (entity.kind === 'DOC') {
				// The doc body renders natively in the Explorer; only its
				// [example] blocks are staged in iframes (with the project css),
				// cascading block attributes over the content.showcase stage defaults.
				const rendered = await renderPageMarkdown(entity.body);
				// Root-absolute asset/link URLs in the prose carry the build's
				// base; SvelteKit's relative base ('./') is handled at runtime via
				// previewBase instead, matching the preview URLs.
				snippets[0].body = applyBaseToHtml(rendered.html, base);
				entry.content = snippets[0];
				entry.toc = rendered.toc;
				entry.padding = entity.sizing.padding ?? config.content.doc.padding;
				entry.contentX = entity.sizing.contentX ?? config.content.doc.contentX;
				entry.bodyTitle = rendered.bodyTitle;
				entry.contentKey = encodeEntityId(filePath, entity.slug);

				entry.examples = snippets.filter((s) => s.role === 'example');
				entity.examples.forEach((example, i) => {
					if (entry.examples[i]) {
						entry.examples[i].stage = {
							maxWidth: example.sizing.maxWidth ?? '100%',
							padding: example.sizing.padding ?? config.content.showcase.padding,
							direction: example.sizing.direction ?? config.content.showcase.direction,
							gap: example.sizing.gap ?? config.content.showcase.gap,
							contentX: example.sizing.contentX ?? config.content.showcase.contentX,
							contentY: example.sizing.contentY ?? config.content.showcase.contentY,
							background: example.sizing.background ?? config.content.showcase.background ?? undefined,
							minHeight: example.sizing.minHeight ?? config.content.showcase.minHeight ?? undefined,
						};
					}
				});
				for (const example of entry.examples) {
					example.highlightedHtml = await highlight(example.body);
				}
			} else if (entity.kind === 'PAGE') {
				// The page body is plain Svelte rendered natively in the docs
				// context — no stage, no iframe. Root-absolute src/href carry the
				// build's base prefix, same as doc prose.
				snippets[0].body = applyBaseToHtml(snippets[0].body, base);
				entry.content = snippets[0];
				entry.padding = entity.sizing.padding ?? config.content.page.padding;
				entry.contentX = entity.sizing.contentX ?? config.content.page.contentX;
				entry.contentKey = encodeEntityId(filePath, entity.slug);
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
			// Doc and page content renders natively (no iframe URL); see pageModules below.
			content: e.content
				? e.kind === 'doc' || e.kind === 'page'
					? e.content
					: withUrl(e, e.content)
				: null,
			toc: e.toc,
			maxWidth: e.maxWidth,
			padding: e.padding,
			contentX: e.contentX,
			showToc: e.showToc,
			bodyTitle: e.bodyTitle,
			contentKey: e.contentKey,
			routeSlug: e.routeSlug,
			hide: e.hide,
		}));
		// Extract named CSS stylesheet names (empty array if single string or null)
		const cssNames = config.css && typeof config.css === 'object'
			? Object.keys(config.css)
			: [];

		// Native doc/page components, as static dynamic imports so every mode
		// (dev, embedded build, CLI build) code-splits them through the module
		// graph — shared Svelte runtime, component CSS via Vite's import helper.
		const pageImports = Array.from(docEntries.values())
			.filter((e) => e.kind === 'doc' || e.kind === 'page')
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
				if (entry.kind === 'doc' || entry.kind === 'page') {
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
