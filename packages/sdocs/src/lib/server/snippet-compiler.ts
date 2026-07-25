import { dirname, relative, resolve, sep } from 'node:path';
import { scrubScriptText } from '../language/script-scan.js';

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
// Import statements on scrubbed text: line-anchored, spanning multi-line
// named imports up to the first `;`, in both `import … from '…'` and
// side-effect `import '…'` forms. The specifier is the trailing quoted group.
const IMPORT_STMT_RE =
	/^(?:[ \t]*import\b(?:[^;'"`]|(['"`])[^'"`\n]*\1)*?\bfrom\s*|[ \t]*import\s+)(['"])([^'"\n]*)\2/gm;

/** One relative import: its specifier and where it sits in the script. */
export interface ScannedImport {
	spec: string;
	start: number;
	end: number;
}

/**
 * The script's *relative* import specifiers, with their offsets.
 *
 * Matches against the scrubbed text (comments and string/template contents
 * blanked, offsets preserved) so an import-shaped substring inside a string
 * literal — a code sample, say — is never treated as an import; the real
 * specifier is then read back from the original at the same offsets. Bare
 * specifiers (npm packages) are skipped: only relative paths are ours to
 * resolve. Single source of truth for both rewriting and existence checks.
 */
export function scanRelativeImports(script: string): ScannedImport[] {
	const found: ScannedImport[] = [];
	const scrubbed = scrubScriptText(script);
	for (const match of scrubbed.matchAll(IMPORT_STMT_RE)) {
		// The match ends with `<quote><specifier><quote>`.
		const end = match.index! + match[0].length - 1;
		const start = end - match[3].length;
		const spec = script.slice(start, end);
		if (!/^\.\.?\//.test(spec)) continue;
		found.push({ spec, start, end });
	}
	return found;
}

export function resolveScriptImports(script: string, docFilePath: string): string {
	const docDir = dirname(docFilePath);
	let out = '';
	let last = 0;
	for (const { spec, start, end } of scanRelativeImports(script)) {
		out += script.slice(last, start) + resolve(docDir, spec);
		last = end;
	}
	return out + script.slice(last);
}

interface ScannedTag {
	name: string;
	/** Offset just past the tag name — the bind:this insertion point */
	nameEnd: number;
	/** Whether the tag's own attribute region already has a bind:this */
	hasBindThis: boolean;
}

/** Scan the markup for real opening tags (a pragmatic walk: HTML comments,
 * `{…}` expressions, and quoted attribute values are skipped, so tag-shaped
 * text inside an attribute string never counts as a tag). */
function scanMarkupTags(body: string): ScannedTag[] {
	const tags: ScannedTag[] = [];
	const n = body.length;
	// Skip a string/template inside an expression or attr region; returns the
	// index past the closing delimiter.
	const skipString = (i: number): number => {
		const q = body[i];
		i++;
		while (i < n) {
			if (body[i] === '\\') i += 2;
			else if (body[i] === q) return i + 1;
			else i++;
		}
		return i;
	};
	// Skip a `{…}` expression (balanced braces, string-aware).
	const skipExpression = (i: number): number => {
		let depth = 0;
		while (i < n) {
			const c = body[i];
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) return i + 1;
			} else if (c === '"' || c === "'" || c === '`') {
				i = skipString(i);
				continue;
			}
			i++;
		}
		return i;
	};
	let i = 0;
	while (i < n) {
		const c = body[i];
		if (body.startsWith('<!--', i)) {
			const close = body.indexOf('-->', i + 4);
			i = close === -1 ? n : close + 3;
		} else if (c === '{') {
			i = skipExpression(i);
		} else if (c === '<' && body[i + 1] === '/') {
			const close = body.indexOf('>', i + 2);
			i = close === -1 ? n : close + 1;
		} else if (c === '<' && /[A-Za-z]/.test(body[i + 1] ?? '')) {
			const name = body.slice(i + 1).match(/^[A-Za-z][\w.:-]*/)![0];
			const nameEnd = i + 1 + name.length;
			// Walk the attribute region to the tag's own '>', skipping quoted
			// values and expression values, noting a bind:this directive.
			let hasBindThis = false;
			let j = nameEnd;
			while (j < n) {
				const a = body[j];
				if (a === '>') {
					j++;
					break;
				}
				if (a === '"' || a === "'") {
					j = skipString(j);
				} else if (a === '{') {
					j = skipExpression(j);
				} else if (body.startsWith('bind:this', j)) {
					hasBindThis = true;
					j += 'bind:this'.length;
				} else {
					j++;
				}
			}
			tags.push({ name, nameEnd, hasBindThis });
			i = j;
		} else {
			i++;
		}
	}
	return tags;
}

/** Add bind:this to the documented component in the snippet so the wrapper
 * can reach its exported methods and state. Binds the first occurrence of
 * the doc's component when named (so wrapped children like
 * <Tabs><Tab/></Tabs> documenting Tab bind the right instance), otherwise
 * the first capitalized tag. Only real tags count — tag-shaped text inside
 * an attribute string never receives the binding. Skipped when the author
 * already binds the targeted tag themselves. */
function injectRootRef(snippetBody: string, componentName?: string): string {
	const tags = scanMarkupTags(snippetBody);
	const target =
		(componentName ? tags.find((t) => t.name === componentName) : undefined) ??
		tags.find((t) => /^[A-Z]/.test(t.name));
	if (!target || target.hasBindThis) return snippetBody;
	return (
		snippetBody.slice(0, target.nameEnd) +
		' bind:this={__sdocsRef}' +
		snippetBody.slice(target.nameEnd)
	);
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
		background?: string;
		minHeight?: string;
	},
	extras?: {
		/** The block's declared `args={{ … }}` literal — seeded as the initial
		 * state so a component using a required prop has it on first render,
		 * before the Controls' first message arrives. */
		args?: Record<string, string | number | boolean | null>;
		/** Block-level <script> content (imports already resolved), appended
		 * after the wrapper plumbing so it can reference `args`. */
		blockScript?: string;
		/** CSS injected into the stage: the file-level <style> plus the block's
		 * own <style>. Emitted as a real style element — the iframe already
		 * isolates it to this one block. */
		styles?: string;
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
		...(stage?.background ? [`background: ${stage.background}`] : []),
		...(stage?.minHeight ? [`min-height: ${stage.minHeight}`] : []),
		...(stage && stage.maxWidth !== '100%'
			? [
					`max-width: ${stage.maxWidth}`,
					// A constrained preview/example stage follows contentX like a
					// DOC/PAGE column: left (the default) stays left, center centers,
					// right hugs the end. A flow-root stage (no contentX) stays centered.
					`margin-inline: ${!stage.contentX || stage.contentX === 'center' ? 'auto' : stage.contentX === 'right' ? 'auto 0' : '0'}`,
				]
			: []),
	].join('; ');
	// The file <script> (imports + shared values), lifted verbatim so previews
	// and examples see everything the entity's siblings do.
	const importBlock = scriptPrelude.trim() ? scriptPrelude.trim() + '\n' : '';
	// The block's own <script>, appended after the plumbing so `args` is in
	// scope. Concatenation is the scoping model: file names are visible here,
	// re-declaring one is a compile error (re-imports get a parser diagnostic).
	const blockScriptSection = extras?.blockScript?.trim()
		? `\n	// [${'block'} script]\n	${extras.blockScript.trim()}\n`
		: '';
	// Stage CSS as a real <style> element via {@html} — global within this
	// block's iframe (which is the isolation boundary), never Svelte-pruned.
	const stylesTag = extras?.styles?.trim()
		? `{@html ${JSON.stringify(`<style>\n${extras.styles.trim()}\n</style>`)}}\n`
		: '';
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
	${importBlock}import { onMount as __sdocsOnMount } from 'svelte';

	let args = $state(${JSON.stringify(extras?.args ?? {})});
	let __sdocsRef = $state();
${blockScriptSection}${stateBroadcast}
	__sdocsOnMount(() => {
		// Custom properties currently applied to the stage — so a var the
		// Controls no longer send (back to its default) is removed again.
		let appliedCssKeys: string[] = [];
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
					for (const key of appliedCssKeys) {
						if (!(key in e.data.vars)) el.style.removeProperty(key);
					}
					appliedCssKeys = Object.keys(e.data.vars);
					for (const [key, value] of Object.entries(e.data.vars)) {
						el.style.setProperty(key, String(value));
					}
				}
			}
		});

		// Internal links leave the stage: the host app navigates instead of the
		// iframe reloading into a nested Explorer. External links, downloads,
		// target="_blank", and same-page #anchors keep their native behaviour.
		document.addEventListener('click', (e) => {
			if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
			const anchor = (e.target as Element | null)?.closest?.('a');
			if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
			if (!anchor.getAttribute('href')) return;
			const url = new URL(anchor.href, location.href);
			if (url.origin !== location.origin) return;
			if (url.pathname === location.pathname && url.hash) return;
			e.preventDefault();
			window.parent.postMessage({ type: 'sdocs:navigate', href: url.href }, '*');
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

${stylesTag}<div id="sdocs-preview" style="${stageStyle}">
	{#snippet SdocsPreview(args)}
		${injectRootRef(snippetBody, componentName)}
	{/snippet}
	<svelte:boundary>
		{@render SdocsPreview(args)}
		{#snippet failed(error)}
			<!-- Styled inline: the generated stage carries no scoped <style> —
			     user stage CSS is injected globally, and a style block here
			     would change what reaches the stage. -->
			<div
				class="sdocs-stage-error"
				role="alert"
				style="padding:12px 14px;border:1px solid #f3b0b0;border-radius:8px;color:#8a1f1f;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.5"
			>
				<strong>This preview threw while rendering.</strong>
				<pre style="margin:6px 0 0;white-space:pre-wrap;font-size:12px">{String(
						(error as Error)?.message ?? error,
					)}</pre>
			</div>
		{/snippet}
	</svelte:boundary>
</div>`;
}

/**
 * Generate the Svelte component for a [DOC] or [PAGE] body, rendered natively
 * inside the Explorer (sdocs styling — the project's css never loads here).
 * DOC prose arrives as rendered markdown with islands verbatim, and
 * `{@render __sdocsExample?.(i)}` markers render the example stages the
 * Explorer passes in as a snippet prop; a PAGE body is plain Svelte.
 */
export function generatePageComponent(
	scriptPrelude: string,
	renderedBody: string,
	fileStyle?: string,
): string {
	const importBlock = scriptPrelude.trim() ? scriptPrelude.trim() + '\n' : '';
	// The file <style> becomes this component's own style — Svelte-scoped, so
	// it can't leak into the Explorer chrome the page renders inside.
	const styleBlock = fileStyle?.trim() ? `\n<style>\n${fileStyle.trim()}\n</style>\n` : '';
	// lang="ts" so lifted imports may carry type-only syntax
	return `<script lang="ts">
	${importBlock}
	let { __sdocsExample } = $props();
</script>

<div class="sdocs-page-body">
${renderedBody}
</div>
${styleBlock}`;
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

function previewHtmlShell(cssLinks: string, script: string, base = '/'): string {
	// The <base> makes base-RELATIVE asset URLs (src="hero.png",
	// url('hero.png'), a path prop) resolve against the site base in dev and
	// in builds deployed under a sub-path alike — the portable way to point a
	// stage at the static folder. Root-absolute '/x' keeps meaning the domain
	// root, as everywhere on the web.
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
	${script}
</body>
</html>`;
}

/** Generate the HTML page served inside the iframe (dev / CLI-build inputs) */
export function generatePreviewHtml(
	iframeComponentId: string,
	css: string | Record<string, string> | null,
	base = '/',
): string {
	return previewHtmlShell(
		generateCssLinks(css),
		`<script type="module">
${generateMountScript(iframeComponentId)}
	</script>`,
		base,
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
	base = '/',
): string {
	const links = cssLinks
		.map(({ href, name, disabled }) => {
			const named = name ? ` data-sdocs-stylesheet="${name}"` : '';
			return `<link rel="stylesheet" href="${href}"${named}${disabled ? ' disabled' : ''}>`;
		})
		.join('\n\t');
	return previewHtmlShell(links, `<script type="module" src="${scriptSrc}"></script>`, base);
}

export interface ParsedSnippetId {
	docFilePath: string;
	entitySlug: string;
	snippetSlug: string;
}

/**
 * Svelte `compilerOptions.warningFilter` for sdocs' generated modules.
 *
 * Two diagnostics are about markup and CSS the `.sdoc` author never wrote and
 * can't change, so reporting them only buries the warnings that matter:
 *
 * - `css_unused_selector` in any generated module. A file-level `<style>` is
 *   documented as CSS for the file's stages, and the same block is injected
 *   into every stage *and* into the DOC/PAGE component. In the stages it's a
 *   global `{@html}` block; in the page component it's a real scoped style,
 *   so every stage-targeting selector is correctly "unused" there — a warning
 *   about markup that lives in another compilation unit.
 * - `a11y_no_noninteractive_tabindex` in a generated **page** module. Prose
 *   is rendered by sdocs' markdown pipeline, and shiki emits
 *   `<pre tabindex="0">` — which is the a11y-correct thing for a scrollable
 *   code block, and comes from us, not the author.
 *
 * Everything else survives, and the project's own components keep every
 * warning they'd normally get.
 */
export function sdocsWarningFilter(warning: { code: string; filename?: string }): boolean {
	const filename = warning.filename ?? '';
	const generated = filename.includes('/@sdocs/');
	if (!generated) return true;
	if (warning.code === 'css_unused_selector') return false;
	// Page modules carry rendered markdown; stages carry authored markup.
	if (warning.code === 'a11y_no_noninteractive_tabindex' && filename.includes('/@sdocs/page/')) {
		return false;
	}
	return true;
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

/** Virtual module ID for a DOC/PAGE entity's native content component */
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
