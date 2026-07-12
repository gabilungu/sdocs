/**
 * [example] blocks inside [DOC]: the scanner captures them as sub-blocks,
 * the parser replaces them with `{@render __sdocsExample?.(i)}` markers and
 * extracts the example bodies, the snippet plan stages them as iframes while
 * the page content stays native, and the projection splits prose and example
 * bodies into sibling snippets so the Svelte layer type-checks the examples.
 */

import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { scanSdoc, parseSdoc, projectSdoc } from '../../src/lib/language/index.js';
import { planEntitySnippets, planIframeSnippets } from '../../src/lib/server/doc-model.js';
import {
	generatePageComponent,
	pageVirtualId,
	parsePageId,
} from '../../src/lib/server/snippet-compiler.js';

const SOURCE = [
	'<script lang="ts">',
	"\timport Button from './Button.svelte';",
	'</script>',
	'',
	'[DOC title="Colors"]',
	'',
	'\t# Colors',
	'',
	'\tSome prose.',
	'',
	'\t[example title="Ramp" direction="row" gap="8px"]',
	'\t\t<Button label="One" />',
	'\t\t<Button label="Two" />',
	'\t[/example]',
	'',
	'\tMore prose.',
	'',
	'\t[example title="Solo"]',
	'\t\t<Button label="Three" />',
	'\t[/example]',
	'',
	'[/DOC]',
	'',
].join('\n');

describe('scanner: [example] inside [DOC]', () => {
	const file = scanSdoc(SOURCE);

	it('captures example sub-blocks with spans', () => {
		expect(file.errors).toEqual([]);
		const page = file.entities[0];
		expect(page.kind).toBe('DOC');
		expect(page.blocks.map((b) => b.kind)).toEqual(['example', 'example']);
		expect(SOURCE.slice(page.blocks[0].span.start, page.blocks[0].span.end)).toMatch(
			/^\[example title="Ramp"[\s\S]*\[\/example\]$/,
		);
	});

	it('keeps the raw body spanning prose and blocks', () => {
		const page = file.entities[0];
		const body = SOURCE.slice(page.bodySpan.start, page.bodySpan.end);
		expect(body).toContain('# Colors');
		expect(body).toContain('[example title="Ramp"');
		expect(body).toContain('More prose.');
	});

	it('rejects [component] inside [DOC] with a pointed message', () => {
		const bad = scanSdoc('[DOC title="P"]\n\t[component component={X}]\n\t\t<X />\n\t[/component]\n[/DOC]\n');
		expect(bad.errors.map((e) => e.code)).toContain('unknown-tag');
		expect(bad.errors[0].message).toContain('[example]');
	});

	it('leaves block syntax inside markdown fences as prose', () => {
		const fenced = scanSdoc(
			'[DOC title="P"]\n\t```\n\t[example title="not real"]\n\t[component]\n\t```\n[/DOC]\n',
		);
		expect(fenced.errors).toEqual([]);
		expect(fenced.entities[0].blocks).toEqual([]);
	});
});

describe('parser: markers and extracted examples', () => {
	const doc = parseSdoc(SOURCE);
	const page = doc.entities[0];

	it('parses clean and typed', () => {
		expect(doc.diagnostics).toEqual([]);
		expect(page.kind).toBe('DOC');
	});

	it('replaces each example with an indexed render marker', () => {
		if (page.kind !== 'DOC') throw new Error('not a page');
		expect(page.body).toContain('{@render __sdocsExample?.(0)}');
		expect(page.body).toContain('{@render __sdocsExample?.(1)}');
		expect(page.body).not.toContain('[example');
		// markers sit between the right prose
		expect(page.body.indexOf('Some prose.')).toBeLessThan(page.body.indexOf('(0)'));
		expect(page.body.indexOf('(0)')).toBeLessThan(page.body.indexOf('More prose.'));
	});

	it('extracts the example bodies with sizing', () => {
		if (page.kind !== 'DOC') throw new Error('not a page');
		expect(page.examples.map((e) => e.title)).toEqual(['Ramp', 'Solo']);
		expect(page.examples[0].body).toBe('<Button label="One" />\n<Button label="Two" />');
		expect(page.examples[0].sizing).toMatchObject({ direction: 'row', gap: '8px' });
	});

	it('flags duplicate example titles within a page', () => {
		const dup = parseSdoc(
			'[DOC title="P"]\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n\t[example title="A"]\n\t\t<b>y</b>\n\t[/example]\n[/DOC]\n',
		);
		expect(dup.diagnostics.map((d) => d.code)).toContain('duplicate-example-title');
		expect(dup.diagnostics[0].message).toContain('[DOC]');
	});

	it('requires a title on page examples', () => {
		const bare = parseSdoc('[DOC title="P"]\n\t[example]\n\t\t<b>x</b>\n\t[/example]\n[/DOC]\n');
		expect(bare.diagnostics.map((d) => d.code)).toContain('example-title-required');
	});
});

describe('snippet planning: native content, iframed examples', () => {
	const page = parseSdoc(SOURCE).entities[0];

	it('plans content plus example snippets for a page', () => {
		expect(planEntitySnippets(page).map((s) => `${s.role}:${s.slug}`)).toEqual([
			'content:content',
			'example:x-ramp',
			'example:x-solo',
		]);
	});

	it('excludes page content from iframe snippets', () => {
		expect(planIframeSnippets(page).map((s) => s.slug)).toEqual(['x-ramp', 'x-solo']);
	});
});

describe('generatePageComponent', () => {
	it('wraps rendered prose with the file script and the example snippet prop', () => {
		const out = generatePageComponent(
			"import Button from '/abs/Button.svelte';",
			'<h1>Hi</h1>\n{@render __sdocsExample?.(0)}',
		);
		expect(out).toContain("import Button from '/abs/Button.svelte';");
		expect(out).toContain('let { __sdocsExample } = $props();');
		expect(out).toContain('<div class="sdocs-page-body">');
		expect(out).toContain('{@render __sdocsExample?.(0)}');
	});

	it('page virtual ids round-trip', () => {
		const id = pageVirtualId('/proj/src/Colors.sdoc', 'colors');
		expect(id).toMatch(/^\/@sdocs\/page\/[A-Za-z0-9_-]+\.svelte$/);
		expect(parsePageId(id)).toEqual({ docFilePath: '/proj/src/Colors.sdoc', entitySlug: 'colors' });
	});
});

describe('projection: sibling snippets for prose and examples', () => {
	const projection = projectSdoc(scanSdoc(SOURCE));
	const lines = projection.text.split('\n');
	const sourceLines = SOURCE.split('\n');

	it('preserves every authored line position', () => {
		expect(projection.sourceLineCount).toBe(sourceLines.length);
	});

	it('splits at example boundaries in place', () => {
		expect(lines[4]).toBe('{#snippet __sdocs$0_p0()}');
		expect(lines[10]).toBe('{/snippet}{#snippet __sdocs$0_0(args: any)}');
		expect(lines[11]).toBe(sourceLines[11]); // example body verbatim
		expect(lines[13]).toBe('{/snippet}{#snippet __sdocs$0_p1()}');
		expect(lines[17]).toBe('{/snippet}{#snippet __sdocs$0_1(args: any)}');
		expect(lines[19]).toBe('{/snippet}{#snippet __sdocs$0_p2()}');
		expect(lines[21]).toBe('{/snippet}');
	});

	it('masks prose and keeps example bodies verbatim', () => {
		expect(projection.lineKinds[8]).toBe('verbatim'); // prose line (not code-masked)
		expect(projection.lineKinds[11]).toBe('verbatim'); // example body
		expect(projection.lineKinds[10]).toBe('wrapper');
	});

	it('renders every sibling snippet in the trailer', () => {
		const trailer = lines.slice(projection.sourceLineCount).join('\n');
		expect(trailer).toContain('{@render __sdocs$0_p0()}');
		expect(trailer).toContain('{@render __sdocs$0_0({})}');
		expect(trailer).toContain('{@render __sdocs$0_p1()}');
		expect(trailer).toContain('{@render __sdocs$0_1({})}');
		expect(trailer).toContain('{@render __sdocs$0_p2()}');
	});

	it('compiles as a Svelte component', () => {
		expect(() => compile(projection.text, { generate: false } as never)).not.toThrow();
	});
});

describe('segmentPageBody fence tracking (review regression)', () => {
	it('a ``` line inside a ~~~ fence is literal content, not a closer', async () => {
		const { segmentPageBody } = await import('../../src/lib/language/page-islands.js');
		const body = ['intro', '', '~~~', '```', '<Widget />', '```', '~~~', '', '<Widget />'].join('\n');
		const segments = segmentPageBody(body);
		// The <Widget /> inside the ~~~ fence stays prose; only the trailing one is an island.
		const islands = segments.filter((s) => s.kind === 'island');
		expect(islands).toHaveLength(1);
		expect(islands[0].lines).toEqual(['<Widget />']);
	});
});
