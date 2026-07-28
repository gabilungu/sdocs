/**
 * [PAGE] body transform: markdown-first with Svelte conveniences.
 *
 * The body is CommonMark/GFM; prose passes through untouched so
 * `{expression}` interpolation and `<Component />` islands compile in the
 * generated Svelte preview. Code fences and inline code are INERT: they are
 * highlighted (fences) or wrapped (inline) at transform time with `{` and
 * `}` escaped, so nothing inside code ever interpolates.
 */

import { Marked } from 'marked';
import type { Token } from 'marked';
import { highlight } from './highlighter.js';
import { segmentPageBody } from '../language/page-islands.js';
import type { TocHeading } from '../types.js';
import { foldAccents } from '../explorer/tree-builder.js';

export interface RenderedPage {
	html: string;
	toc: TocHeading[];
	/** Text of the body's first `#` heading, when present — it takes over as
	 * the page's displayed title. */
	bodyTitle?: string;
}

function slugify(text: string): string {
	return (
		// Same folding as route segments, so an anchor to "Setări" is #setari.
		foldAccents(text)
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/[\s_]+/g, '-') || 'section'
	);
}

/** Make markup Svelte-inert: braces never interpolate. */
function escapeBraces(html: string): string {
	return html.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** marked-equivalent prose escaping (entities already present survive). */
function escapeProse(text: string): string {
	return text
		.replace(/&(?!(?:#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Index of the `}` closing the `{` at `open`, or -1. Skips quoted strings. */
function findExpressionEnd(text: string, open: number): number {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		const ch = text[i];
		if (ch === '"' || ch === "'" || ch === '`') {
			for (i++; i < text.length && text[i] !== ch; i++) {
				if (text[i] === '\\') i++;
			}
			if (i >= text.length) return -1;
		} else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return i;
	}
	return -1;
}

/**
 * Escape prose while passing balanced `{…}` spans through verbatim, so Svelte
 * expressions survive the markdown pass — string literals, `&&`, comparisons.
 * An unmatched `{` falls back to prose escaping, exactly as before.
 */
function escapeTextKeepingExpressions(text: string): string {
	let out = '';
	let from = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== '{') continue;
		const end = findExpressionEnd(text, i);
		if (end === -1) break;
		out += escapeProse(text.slice(from, i)) + text.slice(i, end + 1);
		from = end + 1;
		i = end;
	}
	return out + escapeProse(text.slice(from));
}

function plainText(tokens: Token[]): string {
	let out = '';
	for (const token of tokens) {
		if ('tokens' in token && token.tokens?.length) out += plainText(token.tokens);
		else if ('text' in token) out += token.text;
	}
	return out;
}

/**
 * Render a [PAGE] body: Svelte islands (see segmentPageBody) pass through
 * verbatim — markdown never splits a snippet or an HTML section — and the
 * prose between them renders as markdown. Islands land at the top level of
 * the compiled fragment, so a snippet declared anywhere is renderable from
 * anywhere on the page.
 */
/**
 * Prefix root-absolute src/href URLs in rendered page HTML with the build's
 * public base path. Markdown like `![x](/sample.svg)` or `[a](/guides/colors)`
 * refers to the site root; under a sub-path deploy (GitHub project Pages) the
 * site root is `/repo/`, and Vite only rewrites assets it processes — not
 * URLs inside runtime HTML strings. Protocol-relative (`//`) URLs and dev
 * virtual paths (`/@`) pass through; a root base is a no-op.
 */
export function applyBaseToHtml(html: string, base: string): string {
	if (!base.startsWith('/') || base === '/') return html;
	const prefix = base.replace(/\/$/, '');
	return html.replace(/\b(src|href)="\/(?!\/|@)/g, `$1="${prefix}/`);
}

export async function renderPageMarkdown(source: string): Promise<RenderedPage> {
	const toc: TocHeading[] = [];
	const usedIds = new Set<string>();
	const state: ProseState = { toc, usedIds, bodyTitle: undefined };
	const parts: string[] = [];
	for (const segment of segmentPageBody(source)) {
		if (segment.kind === 'island') {
			parts.push(segment.lines.join('\n'));
		} else {
			parts.push(await renderProse(segment.lines.join('\n'), state));
		}
	}
	return { html: parts.join('\n'), toc, bodyTitle: state.bodyTitle };
}

interface ProseState {
	toc: TocHeading[];
	usedIds: Set<string>;
	bodyTitle: string | undefined;
}

/** GitHub-style alert kinds recognized on a blockquote's first line. */
const ALERT_KINDS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;
const ALERT_RE = new RegExp(`^\\[!(${ALERT_KINDS.join('|')})\\][ \\t]*(?:\\n|$)`);

async function renderProse(source: string, state: ProseState): Promise<string> {
	const { toc, usedIds } = state;
	const headingIds = new WeakMap<Token, string>();
	const fenceHtml = new WeakMap<Token, string>();
	const alertKinds = new WeakMap<Token, string>();

	const marked = new Marked({ gfm: true });
	const tokens = marked.lexer(source);

	/** Detect a GitHub-style alert marker on a blockquote's first line and
	 * strip it from the tokens; the renderer wraps the rest as a callout. */
	const detectAlert = (token: Token) => {
		if (!('tokens' in token) || !token.tokens) return;
		const para = token.tokens[0];
		if (para?.type !== 'paragraph' || !para.tokens) return;
		const first = para.tokens[0];
		if (first?.type !== 'text') return;
		const m = ALERT_RE.exec(first.text ?? '');
		if (!m) return;
		alertKinds.set(token, m[1]);
		first.text = first.text.slice(m[0].length);
		if (first.text === '') para.tokens.shift();
		if (para.tokens.length === 0) token.tokens.shift();
	};

	const walk = (list: Token[]) => {
		for (const token of list) {
			if (token.type === 'heading') {
				const text = plainText(token.tokens ?? []);
				if (token.depth === 1 && state.bodyTitle === undefined) {
					state.bodyTitle = text;
				}
				const baseId = slugify(text);
				let id = baseId;
				for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
				usedIds.add(id);
				headingIds.set(token, id);
				if (token.depth >= 2 && token.depth <= 4) {
					toc.push({ text, level: token.depth, id });
				}
			}
			if (token.type === 'blockquote') detectAlert(token);
			if ('tokens' in token && token.tokens) walk(token.tokens);
			if ('items' in token && token.items) walk(token.items as Token[]);
		}
	};
	walk(tokens);

	// Highlight fences up front (the renderer hooks below must be sync)
	for (const token of tokens) {
		if (token.type === 'code') {
			const lang = (token.lang ?? '').trim().split(/\s+/)[0] || 'text';
			try {
				fenceHtml.set(token, escapeBraces(await highlight(token.text, lang)));
			} catch {
				fenceHtml.set(token, `<pre><code>${escapeBraces(escapeHtml(token.text))}</code></pre>`);
			}
		}
	}

	marked.use({
		renderer: {
			heading(token) {
				const html = this.parser.parseInline(token.tokens);
				const id = headingIds.get(token);
				return id
					? `<h${token.depth} id="${id}">${html}</h${token.depth}>\n`
					: `<h${token.depth}>${html}</h${token.depth}>\n`;
			},
			// GitHub-style alerts: `> [!NOTE]` blockquotes become callouts.
			blockquote(token) {
				const body = this.parser.parse(token.tokens ?? []);
				const kind = alertKinds.get(token);
				if (!kind) return `<blockquote>\n${body}</blockquote>\n`;
				const label = kind.charAt(0) + kind.slice(1).toLowerCase();
				return `<div class="sdocs-alert sdocs-alert-${kind.toLowerCase()}"><p class="sdocs-alert-label">${label}</p>\n${body}</div>\n`;
			},
			// External links open away from the docs app; hrefs stay inert.
			link(token) {
				const inner = this.parser.parseInline(token.tokens ?? []);
				const href = escapeBraces(escapeHtml(token.href ?? ''));
				const title = token.title ? ` title="${escapeBraces(escapeHtml(token.title))}"` : '';
				const external = /^https?:\/\//i.test(token.href ?? '');
				const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
				return `<a href="${href}"${title}${attrs}>${inner}</a>`;
			},
			// Self-closing and brace-escaped so images are always Svelte-safe.
			image(token) {
				const src = escapeBraces(escapeHtml(token.href ?? ''));
				const alt = escapeBraces(escapeHtml(token.text ?? ''));
				const title = token.title ? ` title="${escapeBraces(escapeHtml(token.title))}"` : '';
				return `<img src="${src}" alt="${alt}"${title} loading="lazy" />`;
			},
			code(token) {
				return (
					fenceHtml.get(token) ??
					`<pre><code>${escapeBraces(escapeHtml(token.text))}</code></pre>\n`
				);
			},
			codespan(token) {
				return `<code>${escapeBraces(escapeHtml(token.text))}</code>`;
			},
			// Prose passes through as-is: component islands stay component
			// tags, {expressions} stay expressions.
			html(token) {
				return token.text;
			},
			// Prose escapes for HTML, but balanced {…} spans stay verbatim so
			// expressions keep their quotes and operators. A backslash-escaped
			// brace (`\{`) becomes an inert literal brace.
			text(token) {
				if (token.type === 'escape') return escapeBraces(escapeProse(token.text));
				if ('tokens' in token && token.tokens) return this.parser.parseInline(token.tokens);
				if ('escaped' in token && token.escaped) return token.text;
				return escapeTextKeepingExpressions(token.text);
			}
		}
	});

	return marked.parser(tokens);
}
