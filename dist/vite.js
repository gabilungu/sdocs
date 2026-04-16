import { readFile } from 'node:fs/promises';
import { loadRawConfig, resolveAndFinalize } from './server/config.js';
import { discoverDocFiles, getSdocKind } from './server/discovery.js';
import { parseDocSource } from './server/meta-parser.js';
import { parseComponent } from './server/prop-parser.js';
import { extractSnippets, extractMarkupBody, hasDefaultSnippet, generateAutoDefault, } from './server/snippet-extractor.js';
import { highlight, disposeHighlighter } from './server/highlighter.js';
import { extractTocFromHtml } from './server/toc-extractor.js';
import { parseIframeId, parsePreviewUrl, resolveImportsToAbsolute, generateIframeComponent, generatePreviewHtml, iframeVirtualId, previewUrl, buildPreviewUrl, } from './server/snippet-compiler.js';
const VIRTUAL_MODULE_ID = 'virtual:sdocs';
const RESOLVED_VIRTUAL_ID = '\0virtual:sdocs';
const IFRAME_PREFIX = '/@sdocs/iframe/';
const PREVIEW_PREFIX = '/@sdocs/preview/';
export function sdocsPlugin(userConfig) {
    let config;
    let root;
    let server;
    let docEntries = new Map();
    let docImportsCache = new Map();
    const buildMode = userConfig?._buildMode ?? false;
    return {
        name: 'sdocs',
        async configResolved(resolvedConfig) {
            root = resolvedConfig.root;
            const fileConfig = await loadRawConfig(root);
            const merged = { ...fileConfig, ...userConfig };
            config = resolveAndFinalize(merged, root);
        },
        configureServer(devServer) {
            server = devServer;
            // Middleware: serve iframe preview HTML pages
            server.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith(PREVIEW_PREFIX))
                    return next();
                const parsed = parsePreviewUrl(req.url);
                if (!parsed)
                    return next();
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
            // API: highlight code on demand
            server.middlewares.use((req, res, next) => {
                if (req.url !== '/__sdocs/highlight' || req.method !== 'POST')
                    return next();
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { code, lang } = JSON.parse(body);
                        const html = await highlight(code, lang);
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ html }));
                    }
                    catch {
                        res.statusCode = 400;
                        res.end('Invalid request');
                    }
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
                }
                else if (isComponentReferencedByDoc(filePath)) {
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
                const dirs = new Set();
                for (const file of files) {
                    server.watcher.add(file);
                    dirs.add(file.substring(0, file.lastIndexOf('/')));
                }
                for (const dir of dirs) {
                    server.watcher.add(dir);
                }
            }
        },
        resolveId(id) {
            if (id === VIRTUAL_MODULE_ID)
                return RESOLVED_VIRTUAL_ID;
            if (id.startsWith(IFRAME_PREFIX))
                return '\0' + id;
        },
        load(id) {
            if (id === RESOLVED_VIRTUAL_ID) {
                return generateVirtualModule();
            }
            // Virtual iframe wrapper component
            if (id.startsWith('\0' + IFRAME_PREFIX)) {
                const realId = id.slice(1);
                const parsed = parseIframeId(realId);
                if (!parsed)
                    return null;
                const entry = docEntries.get(parsed.docFilePath);
                if (!entry)
                    return null;
                const snippet = entry.snippets.find((s) => s.name === parsed.snippetName);
                if (!snippet)
                    return null;
                const absoluteImports = docImportsCache.get(parsed.docFilePath) ?? [];
                return generateIframeComponent(absoluteImports, snippet.body);
            }
        },
        async buildEnd() {
            await disposeHighlighter();
        },
    };
    // ─── Process a single doc file ───
    async function processDocFile(filePath) {
        const source = await readFile(filePath, 'utf-8');
        const kind = getSdocKind(filePath);
        const parsed = parseDocSource(source, filePath);
        const meta = parsed.meta;
        const componentPath = parsed.componentPath;
        const imports = parsed.imports;
        let snippets;
        let toc;
        if (kind === 'page' || kind === 'layout') {
            const body = extractMarkupBody(source);
            snippets = [{ name: 'Content', body }];
            if (kind === 'page') {
                toc = extractTocFromHtml(body);
            }
        }
        else {
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
            }
            catch (err) {
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
    function generateVirtualModule() {
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
                previewUrl: buildMode ? buildPreviewUrl(e.filePath, s.name) : previewUrl(e.filePath, s.name),
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
    function invalidateVirtualModule(docFilePath) {
        if (!server)
            return;
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
    function isDocFile(filePath) {
        return filePath.endsWith('.sdoc');
    }
    function isComponentReferencedByDoc(filePath) {
        for (const entry of docEntries.values()) {
            if (entry.componentPath === filePath)
                return true;
        }
        return false;
    }
    async function reprocessComponentEntries(componentPath) {
        for (const [docPath, entry] of docEntries) {
            if (entry.componentPath === componentPath) {
                await processDocFile(docPath);
            }
        }
    }
}
