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
