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

[DOC title="Guides / Usage"]

	## When to use

	A [reference link][SHOWCASE] and a fence:

	\`\`\`svelte
	[preview looks like a tag but is content]
	\`\`\`

[/DOC]

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
		expect(file.entities.map((e) => e.kind)).toEqual(['SHOWCASE', 'DOC', 'LAYOUT']);
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
		const file = scanSdoc('<!-- a note\nspanning lines -->\n[DOC title="X"]\nhi\n[/DOC]\n');
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
		expect(codes('[DOC title="X"]\ntext\n')).toContain('unclosed-block');
	});

	it('reports stray closers and duplicate attributes', () => {
		expect(codes('[/SHOWCASE]\n')).toContain('stray-closer');
		expect(codes('[SHOWCASE title="A" title="B"]\n[/SHOWCASE]\n')).toContain('duplicate-attr');
	});

	it('enforces file anatomy: script top, style bottom', () => {
		expect(codes('[DOC title="X"]\nx\n[/DOC]\n<script>\nlet a;\n</script>\n')).toContain(
			'script-position',
		);
		expect(codes('<style>\n.a {}\n</style>\n[DOC title="X"]\nx\n[/DOC]\n')).toContain(
			'style-position',
		);
	});

	it('recovers when an entity opener appears inside an unclosed [SHOWCASE]', () => {
		const file = scanSdoc('[SHOWCASE title="A"]\n[DOC title="B"]\nx\n[/DOC]\n');
		expect(file.errors.map((e) => e.code)).toContain('unclosed-block');
		expect(file.entities.map((e) => e.kind)).toEqual(['SHOWCASE', 'DOC']);
		expect(file.entities[1].body.trim()).toBe('x');
	});
});

describe('block-level <script> and <style> in sub-block bodies', () => {
	const WITH_BOTH = `<script lang="ts">
	import Nav from './Nav.svelte';
</script>

[SHOWCASE title="Nav"]

	[example title="Sidebar"]
		<script lang="ts">
			const items = [{ label: 'Home' }, { label: 'Docs' }];
			let active = $state('Home');
		</script>
		<Nav {items} {active} />
		<span class="hint">pick one</span>
		<style>
			.hint { color: gray; }
		</style>
	[/example]

[/SHOWCASE]
`;

	it('captures a leading <script> and trailing <style>, leaving the markup between', () => {
		const file = scanSdoc(WITH_BOTH);
		expect(file.errors).toEqual([]);
		const block = file.entities[0].blocks[0];
		expect(block.script).not.toBeNull();
		expect(block.script!.attrsText).toContain('lang="ts"');
		expect(block.script!.content).toContain("let active = $state('Home')");
		expect(block.style).not.toBeNull();
		expect(block.style!.content).toContain('.hint { color: gray; }');
		const markup = WITH_BOTH.slice(block.markupSpan.start, block.markupSpan.end);
		expect(markup).toContain('<Nav {items} {active} />');
		expect(markup).not.toContain('<script');
		expect(markup).not.toContain('<style');
		// The full body still covers script + markup + style (formatter contract)
		expect(block.body).toContain('<script lang="ts">');
		expect(block.body).toContain('</style>');
	});

	it('a body without block tags keeps markup === body', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[example title="Plain"]
		<b>hi</b>
	[/example]
[/SHOWCASE]
`);
		const block = file.entities[0].blocks[0];
		expect(block.script).toBeNull();
		expect(block.style).toBeNull();
		expect(block.markup.trim()).toBe('<b>hi</b>');
	});

	it('flags a <script> that is not the first content of the block', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[example title="Late"]
		<b>hi</b>
		<script>
			const a = 1;
		</script>
	[/example]
[/SHOWCASE]
`);
		expect(file.errors.map((e) => e.code)).toContain('block-script-position');
		expect(file.entities[0].blocks[0].script).toBeNull();
	});

	it('flags a <style> that is not the last content of the block', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[example title="Early"]
		<style>
			.x { color: red; }
		</style>
		<b>hi</b>
	[/example]
[/SHOWCASE]
`);
		expect(file.errors.map((e) => e.code)).toContain('block-style-position');
		// Still captured, so downstream consumers behave predictably
		expect(file.entities[0].blocks[0].style).not.toBeNull();
	});

	it('flags a block <script> left unclosed before the block closer', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[preview component={Nav}]
		<script>
			const a = 1;
	[/preview]
[/SHOWCASE]
`);
		expect(file.errors.map((e) => e.code)).toContain('unclosed-tag');
		expect(file.entities[0].blocks[0].script).toBeNull();
	});

	it('works in DOC [example] blocks too', () => {
		const file = scanSdoc(`[DOC title="Guide"]

	Some prose.

	[example title="Demo"]
		<script>
			const n = 1;
		</script>
		<b>{n}</b>
	[/example]

[/DOC]
`);
		expect(file.errors).toEqual([]);
		const block = file.entities[0].blocks[0];
		expect(block.script).not.toBeNull();
		expect(block.script!.content).toContain('const n = 1;');
	});
});

describe('unclosed block script (review regression)', () => {
	it('reports only unclosed-tag, not a contradictory position error', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[preview component={Nav}]
		<script>
			const a = 1;
	[/preview]
[/SHOWCASE]
`);
		const codes = file.errors.map((e) => e.code);
		expect(codes).toContain('unclosed-tag');
		expect(codes).not.toContain('block-script-position');
	});
});
