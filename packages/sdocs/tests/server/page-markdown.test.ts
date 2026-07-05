import { describe, it, expect } from 'vitest';
import { renderPageMarkdown } from '../../src/lib/server/page-markdown.js';

describe('renderPageMarkdown', () => {
	it('renders markdown prose with escaped quotes', async () => {
		const { html } = await renderPageMarkdown('It\'s a "quoted" phrase.');
		expect(html).toContain('It&#39;s a &quot;quoted&quot; phrase.');
	});

	it('passes {expressions} through verbatim, string literals included', async () => {
		const { html } = await renderPageMarkdown('The color is {format("#ff0000")} today.');
		expect(html).toContain('{format("#ff0000")}');
		// prose around the expression is still escaped
		const { html: mixed } = await renderPageMarkdown('A "quote" and {fn(\'x\')} together.');
		expect(mixed).toContain('&quot;quote&quot;');
		expect(mixed).toContain("{fn('x')}");
	});

	it('keeps operators inside expressions unescaped', async () => {
		const { html } = await renderPageMarkdown('{a && b < c}');
		expect(html).toContain('{a && b < c}');
	});

	it('handles nested braces and braces inside expression strings', async () => {
		const { html } = await renderPageMarkdown('{JSON.stringify({ a: 1 })} and {fn("}")}');
		expect(html).toContain('{JSON.stringify({ a: 1 })}');
		expect(html).toContain('{fn("}")}');
	});

	it('renders {@render snippet("arg")} calls intact', async () => {
		const source = [
			'{#snippet colorBox(color)}',
			'<div style="background:{color}"></div>',
			'{/snippet}',
			'',
			'{@render colorBox("#ff0000")}',
		].join('\n');
		const { html } = await renderPageMarkdown(source);
		expect(html).toContain('{@render colorBox("#ff0000")}');
		expect(html).toContain('{#snippet colorBox(color)}');
	});

	it('keeps inline code and fences inert', async () => {
		const { html } = await renderPageMarkdown('Use `{expression}` syntax.\n\n```js\nconst a = { b: "c" };\n```\n');
		expect(html).toContain('<code>&#123;expression&#125;</code>');
		expect(html).not.toContain('<code>{expression}</code>');
		// fence content never interpolates
		expect(html).not.toMatch(/<pre[^>]*>[\s\S]*\{ b:/);
	});

	it('turns a backslash-escaped brace into an inert literal', async () => {
		const { html } = await renderPageMarkdown('A literal \\{ brace.');
		expect(html).toContain('A literal &#123; brace.');
	});

	it('leaves an unmatched { as prose, as before', async () => {
		const { html } = await renderPageMarkdown('An open { with "quotes" after.');
		expect(html).toContain('{ with &quot;quotes&quot; after.');
	});

	it('hoists a standalone snippet out of markdown (never wrapped in <p>)', async () => {
		const source = [
			'Some prose first.',
			'',
			'{#snippet colorBox(color: string)}',
			'\t<div style="background:{color}"></div>',
			'{/snippet}',
			'',
			'More prose.',
			'',
			'<div style="display:flex;">',
			"\t{@render colorBox('#ff0000')}",
			"\t{@render colorBox('#22c55e')}",
			'</div>',
		].join('\n');
		const { html } = await renderPageMarkdown(source);
		expect(html).not.toContain('<p>{#snippet');
		expect(html).toContain('{#snippet colorBox(color: string)}');
		expect(html).toContain("\t{@render colorBox('#ff0000')}");
		expect(html).toContain('<p>Some prose first.</p>');
		expect(html).toContain('<p>More prose.</p>');
	});

	it('keeps blank lines inside an HTML island (no paragraph split)', async () => {
		const source = [
			'<div class="section">',
			'\t<span>one</span>',
			'',
			'\t<span>two</span>',
			'</div>',
		].join('\n');
		const { html } = await renderPageMarkdown(source);
		// the island is verbatim: no <p> injected between the spans
		expect(html).toContain('<div class="section">');
		expect(html).not.toContain('<p>');
	});

	it('treats a flush component tag as an island but keeps inline tags in prose', async () => {
		const { html } = await renderPageMarkdown(
			'Inline <Button label="x" /> here.\n\n<Button label="alone" />\n',
		);
		expect(html).toContain('<p>Inline <Button label="x" /> here.</p>');
		expect(html).toContain('\n<Button label="alone" />');
		expect(html).not.toContain('<p><Button label="alone"');
	});

	it('collects TOC headings across prose segments split by islands', async () => {
		const source = [
			'## First',
			'',
			'<div>x</div>',
			'',
			'## Second',
		].join('\n');
		const { toc } = await renderPageMarkdown(source);
		expect(toc.map((t) => t.text)).toEqual(['First', 'Second']);
		expect(toc.map((t) => t.id)).toEqual(['first', 'second']);
	});
});

describe('rich markdown features', () => {
	it('turns [!NOTE]-style blockquotes into alerts, marker stripped', async () => {
		const { html } = await renderPageMarkdown('> [!NOTE]\n> Something worth knowing.');
		expect(html).toContain('<div class="sdocs-alert sdocs-alert-note">');
		expect(html).toContain('<p class="sdocs-alert-label">Note</p>');
		expect(html).toContain('Something worth knowing.');
		expect(html).not.toContain('[!NOTE]');
	});

	it('supports all five alert kinds with capitalized labels', async () => {
		for (const [kind, label] of [
			['TIP', 'Tip'], ['IMPORTANT', 'Important'], ['WARNING', 'Warning'], ['CAUTION', 'Caution'],
		] as const) {
			const { html } = await renderPageMarkdown(`> [!${kind}]\n> body`);
			expect(html).toContain(`sdocs-alert-${kind.toLowerCase()}`);
			expect(html).toContain(`>${label}</p>`);
		}
	});

	it('leaves ordinary blockquotes alone', async () => {
		const { html } = await renderPageMarkdown('> Just a quote.');
		expect(html).toContain('<blockquote>');
		expect(html).not.toContain('sdocs-alert');
	});

	it('opens external links in a new tab, leaves internal ones alone', async () => {
		const { html } = await renderPageMarkdown(
			'[out](https://example.com) and [in](#section) and [rel](./other)',
		);
		expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
		expect(html).toContain('<a href="#section">in</a>');
		expect(html).toContain('<a href="./other">rel</a>');
	});

	it('renders images self-closed, lazy, and Svelte-inert', async () => {
		const { html } = await renderPageMarkdown('![alt {braces}](/logo.svg "the title")');
		expect(html).toContain('src="/logo.svg"');
		expect(html).toContain('alt="alt &#123;braces&#125;"');
		expect(html).toContain('title="the title"');
		expect(html).toContain('loading="lazy" />');
	});

	it('renders GFM task lists and strikethrough', async () => {
		const { html } = await renderPageMarkdown('- [x] done\n- [ ] todo\n\n~~gone~~');
		expect(html).toContain('type="checkbox"');
		expect(html).toContain('<del>gone</del>');
	});

	it('reports the first # heading as the body title', async () => {
		const { bodyTitle } = await renderPageMarkdown('# Real Title\n\n## Section\n\n# Second');
		expect(bodyTitle).toBe('Real Title');
	});

	it('reports no body title without an h1', async () => {
		const { bodyTitle } = await renderPageMarkdown('## Only sections here');
		expect(bodyTitle).toBeUndefined();
	});
});

describe('fences shield islands', () => {
	it('keeps a component tag inside a fence as highlighted code, not a live island', async () => {
		const source = [
			'```svelte',
			'<script>',
			'\tlet count = $state(0);',
			'</script>',
			'',
			'<Button label="Count: {count}" onclick={() => count++} />',
			'```',
		].join('\n');
		const { html } = await renderPageMarkdown(source);
		// stays inside the highlighted <pre>, braces inert
		expect(html).toContain('shiki');
		expect(html).not.toContain('label="Count: {count}"');
		expect(html).toContain('&#123;');
	});
});

describe('fence languages', () => {
	it('highlights bash fences as themed shiki blocks', async () => {
		const { html } = await renderPageMarkdown('```bash\nnpm install gabi\n```');
		expect(html).toContain('shiki');
		expect(html).not.toMatch(/<pre><code>/);
	});

	it('renders unknown languages as plaintext shiki blocks, never bare pre', async () => {
		const { html } = await renderPageMarkdown('```someunknownlang\nhello world\n```');
		expect(html).toContain('shiki');
		expect(html).toContain('hello world');
		expect(html).not.toMatch(/<pre><code>/);
	});
});
