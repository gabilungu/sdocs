import { describe, expect, it } from 'vitest';
import { scanSdoc } from '../../src/lib/language/scanner.js';

const FULL = `<script lang="ts">
	import Button from './Button.svelte';
</script>

[SHOWCASE title="Forms / Button" description="A flexible button."]

	[preview component={Button} args={{ label: 'Hi', count: 2 }}]
		<Button {...args} />
	[/preview]

	[example title="Disabled"]
		<Button label="Nope" disabled />
	[/example]

[/SHOWCASE]

[PAGE title="Guides / Usage"]

	## When to use

	A [reference link][SHOWCASE] and a fence:

	\`\`\`svelte
	[preview looks like a tag but is content]
	\`\`\`

[/PAGE]

[LAYOUT title="Patterns / Login" padding="48px"]
	<Button label="Sign in" />
[/LAYOUT]

<style>
	.row { display: flex; }
</style>
`;

describe('scanSdoc structure', () => {
	const file = scanSdoc(FULL);

	it('scans a full file without errors', () => {
		expect(file.errors).toEqual([]);
	});

	it('captures script and style', () => {
		expect(file.script?.attrsText).toContain('lang="ts"');
		expect(file.script?.content).toContain("import Button from './Button.svelte';");
		expect(file.style?.content).toContain('.row { display: flex; }');
	});

	it('finds all three entities in order', () => {
		expect(file.entities.map((e) => e.kind)).toEqual(['SHOWCASE', 'PAGE', 'LAYOUT']);
	});

	it('parses entity attributes with kinds', () => {
		const docs = file.entities[0];
		expect(docs.attrs.title).toMatchObject({ kind: 'string', raw: 'Forms / Button' });
		expect(docs.attrs.description).toMatchObject({ kind: 'string', raw: 'A flexible button.' });
		const layout = file.entities[2];
		expect(layout.attrs.padding).toMatchObject({ kind: 'string', raw: '48px' });
	});

	it('parses sub-blocks with attributes and bodies', () => {
		const [preview, example] = file.entities[0].blocks;
		expect(preview.kind).toBe('preview');
		expect(preview.attrs.component).toMatchObject({ kind: 'expression', raw: 'Button' });
		expect(preview.attrs.args.raw).toBe("{ label: 'Hi', count: 2 }");
		expect(preview.body).toContain('<Button {...args} />');
		expect(example.kind).toBe('example');
		expect(example.body).toContain('<Button label="Nope" disabled />');
	});

	it('keeps bracket-looking lines inside bodies as content', () => {
		const page = file.entities[1];
		expect(page.body).toContain('[reference link][SHOWCASE]');
		expect(page.body).toContain('[preview looks like a tag but is content]');
		expect(file.entities).toHaveLength(3);
	});

	it('tracks spans that slice back to the source', () => {
		const docs = file.entities[0];
		expect(FULL.slice(docs.openerSpan.start, docs.openerSpan.end)).toBe(
			'[SHOWCASE title="Forms / Button" description="A flexible button."]',
		);
		expect(FULL.slice(docs.span.start, docs.span.end).endsWith('[/SHOWCASE]')).toBe(true);
		const preview = docs.blocks[0];
		expect(FULL.slice(preview.bodySpan.start, preview.bodySpan.end)).toBe(preview.body);
	});
});

describe('scanSdoc details', () => {
	it('supports multi-line openers', () => {
		const file = scanSdoc(
			'[SHOWCASE\n\ttitle="Forms / Button"\n\tdescription="Long."\n]\n[/SHOWCASE]\n',
		);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].attrs.title.raw).toBe('Forms / Button');
	});

	it('supports bare attributes', () => {
		const file = scanSdoc('[SHOWCASE title="X" draft]\n[/SHOWCASE]\n');
		expect(file.entities[0].attrs.draft).toMatchObject({ kind: 'bare', raw: '' });
	});

	it('allows comments between blocks', () => {
		const file = scanSdoc('<!-- a note\nspanning lines -->\n[PAGE title="X"]\nhi\n[/PAGE]\n');
		expect(file.errors).toEqual([]);
		expect(file.entities).toHaveLength(1);
	});

	it('tolerates CRLF line endings and a BOM', () => {
		const file = scanSdoc(
			'﻿[SHOWCASE title="X"]\r\n[preview component={B}]\r\n<B />\r\n[/preview]\r\n[/SHOWCASE]\r\n',
		);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].blocks[0].body).toContain('<B />');
	});

	it('handles nested braces and strings in expression attributes', () => {
		const file = scanSdoc(
			`[SHOWCASE title="X"]\n[preview component={Button} args={{ a: '}', b: { }, c: "]" }}]\nx\n[/preview]\n[/SHOWCASE]\n`,
		);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].blocks[0].attrs.args.raw).toBe(`{ a: '}', b: { }, c: "]" }`);
	});
});

function codes(source: string): string[] {
	return scanSdoc(source).errors.map((e) => e.code);
}

describe('scanSdoc errors', () => {
	it('rejects text outside blocks', () => {
		expect(codes('hello\n')).toContain('text-outside-blocks');
		expect(codes('[SHOWCASE title="X"]\nstray text\n[/SHOWCASE]\n')).toContain('text-outside-blocks');
	});

	it('rejects wrong casing with a targeted message', () => {
		expect(codes('[showcase title="X"]\n[/showcase]\n')).toContain('casing');
		expect(codes('[SHOWCASE title="X"]\n[PREVIEW component={B}]\nx\n[/PREVIEW]\n[/SHOWCASE]\n')).toContain(
			'casing',
		);
	});

	it('rejects sub-blocks outside SHOWCASE and unknown blocks inside', () => {
		expect(codes('[preview component={B}]\nx\n[/preview]\n')).toContain('block-outside-entity');
		expect(codes('[SHOWCASE title="X"]\n[stuff]\nx\n[/stuff]\n[/SHOWCASE]\n')).toContain('unknown-tag');
	});

	it('requires openers to be alone on their line', () => {
		expect(codes('[SHOWCASE title="X"] trailing\n[/SHOWCASE]\n')).toContain('tag-not-alone');
	});

	it('reports unclosed blocks', () => {
		expect(codes('[SHOWCASE title="X"]\n')).toContain('unclosed-block');
		expect(codes('[SHOWCASE title="X"]\n[preview component={B}]\nx\n[/SHOWCASE]\n')).toContain(
			'unclosed-block',
		);
		expect(codes('[PAGE title="X"]\ntext\n')).toContain('unclosed-block');
	});

	it('reports stray closers and duplicate attributes', () => {
		expect(codes('[/SHOWCASE]\n')).toContain('stray-closer');
		expect(codes('[SHOWCASE title="A" title="B"]\n[/SHOWCASE]\n')).toContain('duplicate-attr');
	});

	it('enforces file anatomy: script top, style bottom', () => {
		expect(codes('[PAGE title="X"]\nx\n[/PAGE]\n<script>\nlet a;\n</script>\n')).toContain(
			'script-position',
		);
		expect(codes('<style>\n.a {}\n</style>\n[PAGE title="X"]\nx\n[/PAGE]\n')).toContain(
			'style-position',
		);
	});

	it('recovers when an entity opener appears inside an unclosed [SHOWCASE]', () => {
		const file = scanSdoc('[SHOWCASE title="A"]\n[PAGE title="B"]\nx\n[/PAGE]\n');
		expect(file.errors.map((e) => e.code)).toContain('unclosed-block');
		expect(file.entities.map((e) => e.kind)).toEqual(['SHOWCASE', 'PAGE']);
		expect(file.entities[1].body.trim()).toBe('x');
	});
});
