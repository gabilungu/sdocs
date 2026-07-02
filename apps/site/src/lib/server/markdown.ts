import { base } from '$app/paths';
import { Marked } from 'marked';
import type { Token } from 'marked';
import { createHighlighter } from 'shiki';
import type { Highlighter } from 'shiki';

export interface TocEntry {
	depth: number;
	text: string;
	id: string;
}

export interface RenderedMarkdown {
	html: string;
	toc: TocEntry[];
}

const LANG_ALIASES: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	yml: 'yaml'
};

const LANGS = ['javascript', 'typescript', 'svelte', 'bash', 'json', 'html', 'css', 'yaml', 'markdown'];

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
	highlighterPromise ??= createHighlighter({
		themes: ['github-light', 'github-dark'],
		langs: LANGS
	});
	return highlighterPromise;
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_]+/g, '-');
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

function walk(tokens: Token[], visit: (token: Token) => void) {
	for (const token of tokens) {
		visit(token);
		if ('tokens' in token && token.tokens) walk(token.tokens, visit);
		if ('items' in token && token.items) walk(token.items, visit);
	}
}

export async function renderMarkdown(source: string): Promise<RenderedMarkdown> {
	const highlighter = await getHighlighter();
	const toc: TocEntry[] = [];
	const usedIds = new Set<string>();
	const headingIds = new WeakMap<Token, string>();
	const codeHtml = new WeakMap<Token, string>();

	const marked = new Marked({ gfm: true });
	const tokens = marked.lexer(source);

	walk(tokens, (token) => {
		if (token.type === 'heading') {
			const text = plainText(token.tokens ?? []);
			const baseId = slugify(text) || 'section';
			let id = baseId;
			for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
			usedIds.add(id);
			headingIds.set(token, id);
			if (token.depth === 2 || token.depth === 3) toc.push({ depth: token.depth, text, id });
		} else if (token.type === 'code') {
			const raw = (token.lang ?? '').trim().split(/\s+/)[0].toLowerCase();
			const lang = LANG_ALIASES[raw] ?? raw;
			codeHtml.set(
				token,
				highlighter.codeToHtml(token.text, {
					lang: LANGS.includes(lang) ? lang : 'text',
					themes: { light: 'github-light', dark: 'github-dark' }
				})
			);
		}
	});

	marked.use({
		renderer: {
			heading(token) {
				const html = this.parser.parseInline(token.tokens);
				const id = headingIds.get(token);
				if (!id || token.depth === 1) return `<h${token.depth}>${html}</h${token.depth}>\n`;
				return `<h${token.depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${html}</h${token.depth}>\n`;
			},
			code(token) {
				return codeHtml.get(token) ?? `<pre><code>${escapeHtml(token.text)}</code></pre>\n`;
			},
			link(token) {
				const html = this.parser.parseInline(token.tokens);
				// Site-internal links are authored root-absolute (/docs/...); prefix the base
				// path. Protocol-relative URLs (//host/...) are external, not site-internal.
				const internal = token.href.startsWith('/') && !token.href.startsWith('//');
				const href = escapeHtml(internal ? base + token.href : token.href);
				const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
				return `<a href="${href}"${title}>${html}</a>`;
			}
		}
	});

	return { html: marked.parser(tokens), toc };
}
