import { dirname, resolve } from 'node:path';

/** Base64url encode a string (URL-safe, no padding) */
export function base64urlEncode(str: string): string {
	return Buffer.from(str).toString('base64url');
}

/** Base64url decode */
export function base64urlDecode(str: string): string {
	return Buffer.from(str, 'base64url').toString('utf-8');
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
	return `<script>
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
	${snippetBody}
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

/** Generate the HTML page served inside the iframe */
export function generatePreviewHtml(
	iframeComponentId: string,
	css: string | Record<string, string> | null,
): string {
	const cssLinks = generateCssLinks(css);
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
		});
	</script>
</body>
</html>`;
}

/** Build the virtual module ID for an iframe wrapper component */
export function iframeVirtualId(docFilePath: string, snippetName: string): string {
	return `/@sdocs/iframe/${base64urlEncode(docFilePath)}/${snippetName}.svelte`;
}

/** Build the preview URL for an iframe HTML page (dev mode) */
export function previewUrl(docFilePath: string, snippetName: string): string {
	return `/@sdocs/preview/${base64urlEncode(docFilePath)}/${snippetName}`;
}

/** Build the preview URL for static build output */
export function buildPreviewUrl(docFilePath: string, snippetName: string): string {
	return `/previews/${base64urlEncode(docFilePath)}/${snippetName}.html`;
}

/** Parse an iframe virtual ID back into its parts */
export function parseIframeId(id: string): { docFilePath: string; snippetName: string } | null {
	const match = id.match(/^\/@sdocs\/iframe\/([^/]+)\/(\w+)\.svelte$/);
	if (!match) return null;
	return {
		docFilePath: base64urlDecode(match[1]),
		snippetName: match[2],
	};
}

/** Parse a preview URL back into its parts */
export function parsePreviewUrl(url: string): { docFilePath: string; snippetName: string } | null {
	const match = url.match(/^\/@sdocs\/preview\/([^/]+)\/(\w+)$/);
	if (!match) return null;
	return {
		docFilePath: base64urlDecode(match[1]),
		snippetName: match[2],
	};
}
