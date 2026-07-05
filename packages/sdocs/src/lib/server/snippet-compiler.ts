import { dirname, relative, resolve, sep } from 'node:path';

/** Base64url encode a string (URL-safe, no padding) */
export function base64urlEncode(str: string): string {
	return Buffer.from(str).toString('base64url');
}

/** Base64url decode */
export function base64urlDecode(str: string): string {
	return Buffer.from(str, 'base64url').toString('utf-8');
}

// Doc paths are encoded relative to this root. Encoding absolute paths would
// leak the machine's filesystem layout into published URLs and produce path
// segments long enough to break static hosts (GitHub Pages rejects them).
let docPathRoot = process.cwd();

/** Set the root that doc paths are encoded against (the Vite root / staging dir) */
export function setDocPathRoot(root: string): void {
	docPathRoot = root;
}

/** Encode a doc entity (file + entity slug) for URLs and emitted file names.
 * The slug rides inside the token as a '#' fragment so every URL shape keeps
 * exactly one token path segment. */
export function encodeEntityId(filePath: string, entitySlug: string): string {
	return base64urlEncode(
		relative(docPathRoot, filePath).split(sep).join('/') + '#' + entitySlug,
	);
}

/** Decode an encoded entity id back to an absolute path + entity slug */
function decodeEntityId(encoded: string): { docFilePath: string; entitySlug: string } {
	const decoded = base64urlDecode(encoded);
	const hash = decoded.lastIndexOf('#');
	const relPath = hash === -1 ? decoded : decoded.slice(0, hash);
	return {
		docFilePath: resolve(docPathRoot, relPath),
		entitySlug: hash === -1 ? '' : decoded.slice(hash + 1),
	};
}

/** The docEntries key for one entity of one file */
export function entityKey(filePath: string, entitySlug: string): string {
	return `${filePath}#${entitySlug}`;
}

/** Resolve relative imports to absolute paths for use in virtual components */
export function resolveImportsToAbsolute(
	imports: string[],
	docFilePath: string,
): string[] {
	const docDir = dirname(docFilePath);
	return imports.map((imp) => {
		const match = imp.match(/^(import\s+.+\s+from\s+)['"](\.[^'"]+)['"](;?)$/);
		if (match) {
			const absolutePath = resolve(docDir, match[2]);
			return `${match[1]}'${absolutePath}'${match[3]}`;
		}
		return imp;
	});
}

/**
 * Rewrite the relative import specifiers in a whole `<script>` block to
 * absolute paths, so the file script — imports AND shared values (consts,
 * functions) — can be lifted verbatim into a generated preview. Everything
 * else in the script is preserved, which is what makes shared values
 * available to previews and examples.
 */
export function resolveScriptImports(script: string, docFilePath: string): string {
	const docDir = dirname(docFilePath);
	return script.replace(
		/(\bfrom\s+|\bimport\s+)(['"])(\.\.?\/[^'"]*)\2/g,
		(_m, keyword, quote, spec) => `${keyword}${quote}${resolve(docDir, spec)}${quote}`,
	);
}

/** Add bind:this to the documented component in the snippet so the wrapper
 * can reach its exported methods and state. Binds the first occurrence of
 * the doc's component when named (so wrapped children like
 * <Tabs><Tab/></Tabs> documenting Tab bind the right instance), otherwise
 * the first capitalized tag. Skipped when the author already binds. */
function injectRootRef(snippetBody: string, componentName?: string): string {
	if (snippetBody.includes('bind:this')) return snippetBody;
	let match: RegExpMatchArray | null = null;
	if (componentName) {
		const escaped = componentName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
		match = snippetBody.match(new RegExp(`<${escaped}(?=[\\s/>])`));
	}
	if (!match) match = snippetBody.match(/<[A-Z][A-Za-z0-9_]*(?=[\s/>])/);
	if (!match || match.index === undefined) return snippetBody;
	const insertAt = match.index + match[0].length;
	return snippetBody.slice(0, insertAt) + ' bind:this={__sdocsRef}' + snippetBody.slice(insertAt);
}

/** Generate a virtual Svelte iframe wrapper component for a snippet.
 * Includes $state for reactive prop updates via postMessage, invokes
 * component methods on request, and broadcasts exported state values. */
export function generateIframeComponent(
	scriptPrelude: string,
	snippetBody: string,
	stateNames: string[] = [],
	componentName?: string,
	stage?: {
		maxWidth: string;
		padding: string;
		direction?: string;
		gap?: string;
		contentX?: string;
		contentY?: string;
	},
): string {
	// The stage layout (config -> entity -> block cascade) applies here, inside
	// the iframe, so every consumer of the preview page gets it. Preview and
	// example stages are flex containers (direction + gap + alignment); page and
	// layout stages are flow-root blocks. Both contain child margins, so the
	// height reported for iframe auto-sizing is exact.
	//
	// contentX/contentY are *physical* (horizontal/vertical); which flex
	// property each drives depends on direction. The flow axis (main) takes
	// justify-content, the other (cross) takes align-items — and align-items
	// has no distribution value, so a 'justify' that lands on the cross axis
	// falls back to stretch.
	const H: Record<string, string> = {
		left: 'flex-start',
		center: 'center',
		right: 'flex-end',
		justify: 'space-between',
	};
	const V: Record<string, string> = {
		top: 'flex-start',
		middle: 'center',
		bottom: 'flex-end',
		justify: 'space-between',
	};
	const flexStage = () => {
		const h = H[stage!.contentX ?? 'left'] ?? 'flex-start';
		const v = V[stage!.contentY ?? 'top'] ?? 'flex-start';
		const isColumn = String(stage!.direction).startsWith('column');
		const justify = isColumn ? v : h;
		let alignItems = isColumn ? h : v;
		if (alignItems === 'space-between') alignItems = 'stretch';
		return [
			'display: flex',
			`flex-direction: ${stage!.direction}`,
			'flex-wrap: wrap',
			`justify-content: ${justify}`,
			`align-items: ${alignItems}`,
			`gap: ${stage!.gap}`,
		];
	};
	const stageStyle = [
		...(stage?.direction ? flexStage() : ['display: flow-root']),
		...(stage ? [`padding: ${stage.padding}`] : []),
		...(stage && stage.maxWidth !== '100%'
			? [`max-width: ${stage.maxWidth}`, 'margin-inline: auto']
			: []),
	].join('; ');
	// The file <script> (imports + shared values), lifted verbatim so previews
	// and examples see everything the entity's siblings do.
	const importBlock = scriptPrelude.trim() ? scriptPrelude.trim() + '\n' : '';
	const stateBroadcast = stateNames.length > 0
		? `
	$effect(() => {
		const values: Record<string, unknown> = {};
		for (const name of ${JSON.stringify(stateNames)}) {
			try {
				const v = (__sdocsRef as Record<string, unknown> | undefined)?.[name];
				values[name] = v === undefined ? undefined : JSON.parse(JSON.stringify($state.snapshot(v)));
			} catch {
				values[name] = undefined;
			}
		}
		window.parent.postMessage({ type: 'sdocs:state-values', values }, '*');
	});
`
		: '';
	// lang="ts" so lifted imports may carry type-only syntax (Svelte 5 erases it natively)
	return `<script lang="ts">
	${importBlock}import { onMount } from 'svelte';

	let args = $state({});
	let __sdocsRef = $state();
${stateBroadcast}
	onMount(() => {
		window.addEventListener('message', (e) => {
			if (e.data?.type === 'sdocs:update-props') {
				args = { ...e.data.props };
			}
			if (e.data?.type === 'sdocs:call-method') {
				(__sdocsRef as Record<string, () => void> | undefined)?.[e.data.name]?.();
			}
			if (e.data?.type === 'sdocs:update-css') {
				const el = document.getElementById('sdocs-preview');
				if (el) {
					for (const [key, value] of Object.entries(e.data.vars)) {
						el.style.setProperty(key, String(value));
					}
				}
			}
		});

		// Assign IDs to headings for ToC scroll-to
		const preview = document.getElementById('sdocs-preview');
		if (preview) {
			preview.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
				if (!h.id) {
					h.id = h.textContent.toLowerCase().replace(/[^a-z0-9\\s-]/g, '').replace(/\\s+/g, '-').replace(/-+/g, '-').trim();
				}
			});
		}

		window.parent.postMessage({ type: 'sdocs:preview-ready' }, '*');

		// Report content height to parent for auto-sizing. The preview div is
		// display: flow-root so child margins are contained — otherwise the
		// first/last child's margins collapse through it, scrollHeight comes up
		// short, and the iframe clips the final block of content.
		const ro = new ResizeObserver(() => {
			const height = document.getElementById('sdocs-preview')?.scrollHeight ?? 0;
			window.parent.postMessage({ type: 'sdocs:resize', height }, '*');
		});
		ro.observe(document.getElementById('sdocs-preview'));
		return () => ro.disconnect();
	});
</script>

<div id="sdocs-preview" style="${stageStyle}">
	{#snippet SdocsPreview(args)}
		${injectRootRef(snippetBody, componentName)}
	{/snippet}
	{@render SdocsPreview(args)}
</div>`;
}

/**
 * Generate the Svelte component for a [PAGE] body, rendered natively inside
 * the Explorer (sdocs styling — the project's css never loads here). Prose
 * arrives as rendered markdown, islands verbatim; `{@render __sdocsExample?.(i)}`
 * markers render the example stages the Explorer passes in as a snippet prop.
 */
export function generatePageComponent(scriptPrelude: string, renderedBody: string): string {
	const importBlock = scriptPrelude.trim() ? scriptPrelude.trim() + '\n' : '';
	// lang="ts" so lifted imports may carry type-only syntax
	return `<script lang="ts">
	${importBlock}
	let { __sdocsExample } = $props();
</script>

<div class="sdocs-page-body">
${renderedBody}
</div>
`;
}

/** Convert a CSS path to a Vite-servable URL */
function normalizeCssHref(href: string): string {
	if (href.startsWith('http')) return href;
	// Absolute filesystem path → use Vite's /@fs/ prefix
	if (href.startsWith('/')) return `/@fs${href}`;
	return '/' + href;
}

/** Generate CSS link tags for the preview HTML */
function generateCssLinks(css: string | Record<string, string> | null): string {
	if (!css) return '';
	if (typeof css === 'string') {
		return `<link rel="stylesheet" href="${normalizeCssHref(css)}">`;
	}
	// Named stylesheets: first one active, rest disabled
	const names = Object.keys(css);
	return names
		.map((name, i) =>
			`<link rel="stylesheet" href="${normalizeCssHref(css[name])}" data-sdocs-stylesheet="${name}"${i > 0 ? ' disabled' : ''}>`,
		)
		.join('\n\t');
}

/** The JS that boots a preview page: mount the wrapper + parent-frame messaging. */
export function generateMountScript(iframeComponentId: string): string {
	return `import { mount } from 'svelte';
import App from '${iframeComponentId}';
mount(App, { target: document.getElementById('app') });

// Listen for sdocs messages from the parent frame
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
});`;
}

function previewHtmlShell(cssLinks: string, script: string): string {
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
	${script}
</body>
</html>`;
}

/** Generate the HTML page served inside the iframe (dev / CLI-build inputs) */
export function generatePreviewHtml(
	iframeComponentId: string,
	css: string | Record<string, string> | null,
): string {
	return previewHtmlShell(
		generateCssLinks(css),
		`<script type="module">
${generateMountScript(iframeComponentId)}
	</script>`,
	);
}

export interface StaticCssLink {
	href: string;
	name?: string;
	disabled?: boolean;
}

/** Generate the HTML page for a preview emitted into a host app's build. */
export function generateStaticPreviewHtml(
	scriptSrc: string,
	cssLinks: StaticCssLink[],
): string {
	const links = cssLinks
		.map(({ href, name, disabled }) => {
			const named = name ? ` data-sdocs-stylesheet="${name}"` : '';
			return `<link rel="stylesheet" href="${href}"${named}${disabled ? ' disabled' : ''}>`;
		})
		.join('\n\t');
	return previewHtmlShell(links, `<script type="module" src="${scriptSrc}"></script>`);
}

export interface ParsedSnippetId {
	docFilePath: string;
	entitySlug: string;
	snippetSlug: string;
}

/** Build the virtual module ID for an iframe wrapper component */
export function iframeVirtualId(docFilePath: string, entitySlug: string, snippetSlug: string): string {
	return `/@sdocs/iframe/${encodeEntityId(docFilePath, entitySlug)}/${snippetSlug}.svelte`;
}

/** Build the preview URL for an iframe HTML page (dev mode) */
export function previewUrl(docFilePath: string, entitySlug: string, snippetSlug: string): string {
	return `/@sdocs/preview/${encodeEntityId(docFilePath, entitySlug)}/${snippetSlug}`;
}

/** Build the preview URL for static build output */
export function buildPreviewUrl(docFilePath: string, entitySlug: string, snippetSlug: string): string {
	return `/previews/${encodeEntityId(docFilePath, entitySlug)}/${snippetSlug}.html`;
}

/** Virtual module ID for a PAGE entity's native content component */
export function pageVirtualId(docFilePath: string, entitySlug: string): string {
	return `/@sdocs/page/${encodeEntityId(docFilePath, entitySlug)}.svelte`;
}

/** Parse a page virtual ID back into its parts */
export function parsePageId(id: string): { docFilePath: string; entitySlug: string } | null {
	const match = id.match(/^\/@sdocs\/page\/([^/]+)\.svelte$/);
	if (!match) return null;
	return decodeEntityId(match[1]);
}

/** Virtual module ID for a preview's mount script (embedded production builds) */
export function mountVirtualId(docFilePath: string, entitySlug: string, snippetSlug: string): string {
	return `/@sdocs/mount/${encodeEntityId(docFilePath, entitySlug)}/${snippetSlug}.js`;
}

/** Parse a mount virtual ID back into its parts */
export function parseMountId(id: string): ParsedSnippetId | null {
	const match = id.match(/^\/@sdocs\/mount\/([^/]+)\/([\w-]+)\.js$/);
	if (!match) return null;
	return { ...decodeEntityId(match[1]), snippetSlug: match[2] };
}

/** Parse an iframe virtual ID back into its parts */
export function parseIframeId(id: string): ParsedSnippetId | null {
	const match = id.match(/^\/@sdocs\/iframe\/([^/]+)\/([\w-]+)\.svelte$/);
	if (!match) return null;
	return { ...decodeEntityId(match[1]), snippetSlug: match[2] };
}

/** Parse a preview URL back into its parts */
export function parsePreviewUrl(url: string): ParsedSnippetId | null {
	const match = url.match(/^\/@sdocs\/preview\/([^/]+)\/([\w-]+)$/);
	if (!match) return null;
	return { ...decodeEntityId(match[1]), snippetSlug: match[2] };
}
