import { renderMarkdown } from './markdown';
import type { TocEntry } from './markdown';

export interface NavItem {
	title: string;
	slug: string;
}

export interface NavSection extends NavItem {
	children: NavItem[];
}

export interface Doc {
	slug: string;
	title: string;
	html: string;
	toc: TocEntry[];
	prev: NavItem | null;
	next: NavItem | null;
}

interface Page {
	rel: string;
	slug: string;
	title: string;
	body: string;
}

const files = import.meta.glob('/content/docs/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

function parseFrontmatter(raw: string, path: string): { title: string; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) throw new Error(`Missing frontmatter in ${path}`);
	const title = /^title:\s*(.+)$/m.exec(match[1])?.[1].trim().replace(/^['"]|['"]$/g, '');
	if (!title) throw new Error(`Missing title in ${path}`);
	return { title, body: raw.slice(match[0].length) };
}

// Directory layout is the source of truth: nesting defines sections, numeric
// prefixes (01-...) define order and are stripped from slugs, index.md is the
// section landing page.
const pages: Page[] = Object.entries(files)
	.map(([path, raw]) => {
		const rel = path.replace('/content/docs/', '');
		const slug = rel
			.replace(/\.md$/, '')
			.split('/')
			.map((segment) => segment.replace(/^\d+-/, ''))
			.filter((segment) => segment !== 'index')
			.join('/');
		return { rel, slug, ...parseFrontmatter(raw, path) };
	})
	.sort((a, b) => {
		// Drop the 'index.md' filename so a section's landing page sorts before its children.
		const keyA = a.rel.replace(/(^|\/)index\.md$/, '$1');
		const keyB = b.rel.replace(/(^|\/)index\.md$/, '$1');
		return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
	});

const nav: NavSection[] = [];
for (const page of pages) {
	const item = { title: page.title, slug: page.slug };
	if (!page.rel.includes('/')) {
		nav.push({ ...item, children: [] });
	} else if (page.rel.endsWith('/index.md')) {
		nav.push({ ...item, children: [] });
	} else {
		nav.at(-1)?.children.push(item);
	}
}

export function getNav(): NavSection[] {
	return nav;
}

export function getSlugs(): string[] {
	return pages.map((page) => page.slug);
}

export async function getDoc(slug: string): Promise<Doc | null> {
	const index = pages.findIndex((page) => page.slug === slug);
	if (index === -1) return null;
	const page = pages[index];
	const prev = pages[index - 1];
	const next = pages[index + 1];
	const { html, toc } = await renderMarkdown(page.body);
	return {
		slug: page.slug,
		title: page.title,
		html,
		toc,
		prev: prev ? { title: prev.title, slug: prev.slug } : null,
		next: next ? { title: next.title, slug: next.slug } : null
	};
}
