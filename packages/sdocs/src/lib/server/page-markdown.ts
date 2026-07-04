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

function plainText(tokens: Token[]): string {
	let out = '';
	for (const token of tokens) {
		if ('tokens' in token && token.tokens?.length) out += plainText(token.tokens);
		else if ('text' in token) out += token.text;
	}
	return out;
}

export async function renderPageMarkdown(source: string): Promise<RenderedPage> {
	const toc: TocHeading[] = [];
	const usedIds = new Set<string>();
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
			}
		}
	});

	return { html: marked.parser(tokens), toc };
}
