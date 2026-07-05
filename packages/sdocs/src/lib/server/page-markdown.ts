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

export interface RenderedPage {
	html: string;
	toc: TocHeading[];
}

function slugify(text: string): string {
	return (
		text
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
export async function renderPageMarkdown(source: string): Promise<RenderedPage> {
	const toc: TocHeading[] = [];
	const usedIds = new Set<string>();
	const parts: string[] = [];
	for (const segment of segmentPageBody(source)) {
		if (segment.kind === 'island') {
			parts.push(segment.lines.join('\n'));
		} else {
			parts.push(await renderProse(segment.lines.join('\n'), toc, usedIds));
		}
	}
	return { html: parts.join('\n'), toc };
}

async function renderProse(
	source: string,
	toc: TocHeading[],
	usedIds: Set<string>,
): Promise<string> {
	const headingIds = new WeakMap<Token, string>();
	const fenceHtml = new WeakMap<Token, string>();

	const marked = new Marked({ gfm: true });
	const tokens = marked.lexer(source);

	const walk = (list: Token[]) => {
		for (const token of list) {
			if (token.type === 'heading') {
				const text = plainText(token.tokens ?? []);
				const baseId = slugify(text);
				let id = baseId;
				for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
				usedIds.add(id);
				headingIds.set(token, id);
				if (token.depth >= 2 && token.depth <= 4) {
					toc.push({ text, level: token.depth, id });
				}
			}
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
