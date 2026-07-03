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

/** Encode a doc file path for use in URLs and emitted file names */
export function encodeDocPath(filePath: string): string {
	return base64urlEncode(relative(docPathRoot, filePath).split(sep).join('/'));
}

/** Decode an encoded doc path back to an absolute path */
function decodeDocPath(encoded: string): string {
	return resolve(docPathRoot, base64urlDecode(encoded));
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

/** Generate a virtual Svelte iframe wrapper component for a snippet.
 * Includes $state for reactive prop updates via postMessage. */
export function generateIframeComponent(
	absoluteImports: string[],
	snippetBody: string,
): string {
	const importBlock = absoluteImports.length > 0
		? absoluteImports.join('\n') + '\n'
		: '';
	// lang="ts" so lifted imports may carry type-only syntax (Svelte 5 erases it natively)
	return `<script lang="ts">
	${importBlock}import { onMount } from 'svelte';

	let args = $state({});

	onMount(() => {
		window.addEventListener('message', (e) => {
			if (e.data?.type === 'sdocs:update-props') {
				args = { ...e.data.props };
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

		// Report content height to parent for auto-sizing
		const ro = new ResizeObserver(() => {
			const height = document.getElementById('sdocs-preview')?.scrollHeight ?? 0;
			window.parent.postMessage({ type: 'sdocs:resize', height }, '*');
		});
		ro.observe(document.getElementById('sdocs-preview'));
		return () => ro.disconnect();
	});
</script>

<div id="sdocs-preview">
	{#snippet SdocsPreview(args)}
		${snippetBody}
	{/snippet}
	{@render SdocsPreview(args)}
</div>`;
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

/** Build the virtual module ID for an iframe wrapper component */
export function iframeVirtualId(docFilePath: string, snippetName: string): string {
	return `/@sdocs/iframe/${encodeDocPath(docFilePath)}/${snippetName}.svelte`;
}

/** Build the preview URL for an iframe HTML page (dev mode) */
export function previewUrl(docFilePath: string, snippetName: string): string {
	return `/@sdocs/preview/${encodeDocPath(docFilePath)}/${snippetName}`;
}

/** Build the preview URL for static build output */
export function buildPreviewUrl(docFilePath: string, snippetName: string): string {
	return `/previews/${encodeDocPath(docFilePath)}/${snippetName}.html`;
}

/** Virtual module ID for a preview's mount script (embedded production builds) */
export function mountVirtualId(docFilePath: string, snippetName: string): string {
	return `/@sdocs/mount/${encodeDocPath(docFilePath)}/${snippetName}.js`;
}

/** Parse a mount virtual ID back into its parts */
export function parseMountId(id: string): { docFilePath: string; snippetName: string } | null {
	const match = id.match(/^\/@sdocs\/mount\/([^/]+)\/(\w+)\.js$/);
	if (!match) return null;
	return {
		docFilePath: decodeDocPath(match[1]),
		snippetName: match[2],
	};
}

/** Parse an iframe virtual ID back into its parts */
export function parseIframeId(id: string): { docFilePath: string; snippetName: string } | null {
	const match = id.match(/^\/@sdocs\/iframe\/([^/]+)\/(\w+)\.svelte$/);
	if (!match) return null;
	return {
		docFilePath: decodeDocPath(match[1]),
		snippetName: match[2],
	};
}

/** Parse a preview URL back into its parts */
export function parsePreviewUrl(url: string): { docFilePath: string; snippetName: string } | null {
	const match = url.match(/^\/@sdocs\/preview\/([^/]+)\/(\w+)$/);
	if (!match) return null;
	return {
		docFilePath: decodeDocPath(match[1]),
		snippetName: match[2],
	};
}
