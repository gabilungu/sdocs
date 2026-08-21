import { describe, expect, it } from 'vitest';
import { scanSdoc } from '../../src/lib/language/scanner.js';

const FULL = `<script lang="ts">
	import Button from './Button.svelte';
</script>

[SHOWCASE title="Forms / Button" description="A flexible button."]

	[component component={Button} args={{ label: 'Hi', count: 2 }}]
		<Button {...args} />
	[/component]

	[example title="Disabled"]
		<Button label="Nope" disabled />
	[/example]

[/SHOWCASE]

[DOC title="Guides / Usage"]

	## When to use

	A [reference link][SHOWCASE] and a fence:

	\`\`\`svelte
	[component looks like a tag but is content]
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
		expect(page.body).toContain('[component looks like a tag but is content]');
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
			'﻿[SHOWCASE title="X"]\r\n[component component={B}]\r\n<B />\r\n[/component]\r\n[/SHOWCASE]\r\n',
		);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].blocks[0].body).toContain('<B />');
	});

	it('handles nested braces and strings in expression attributes', () => {
		const file = scanSdoc(
			`[SHOWCASE title="X"]\n[component component={Button} args={{ a: '}', b: { }, c: "]" }}]\nx\n[/component]\n[/SHOWCASE]\n`,
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

	it('rejects a lowercase entity with a targeted message', () => {
		// Entities have always been uppercase, so there is no old spelling to
		// keep working.
		expect(codes('[showcase title="X"]\n[/showcase]\n')).toContain('casing');
	});

	it('takes a sub-block in either casing', () => {
		// [COMPONENT] is the spelling from 0.0.139 on; [component] is what every
		// file written before it says, and the formatter is what migrates them.
		// Formatting is opt-in, so both spellings work permanently.
		const upper = '[SHOWCASE title="X"]\n[COMPONENT component={B}]\nx\n[/COMPONENT]\n[/SHOWCASE]\n';
		const lower = '[SHOWCASE title="X"]\n[component component={B}]\nx\n[/component]\n[/SHOWCASE]\n';
		expect(codes(upper)).toEqual([]);
		expect(codes(lower)).toEqual([]);
	});

	it('does not take a closer whose casing differs from its opener', () => {
		// Both spellings are legal, but a block still has to close itself.
		expect(
			codes('[SHOWCASE title="X"]\n[COMPONENT component={B}]\nx\n[/component]\n[/SHOWCASE]\n'),
		).not.toEqual([]);
	});

	it('rejects sub-blocks outside SHOWCASE and unknown blocks inside', () => {
		expect(codes('[component component={B}]\nx\n[/component]\n')).toContain('block-outside-entity');
		expect(codes('[SHOWCASE title="X"]\n[stuff]\nx\n[/stuff]\n[/SHOWCASE]\n')).toContain('unknown-tag');
	});

	it('requires openers to be alone on their line', () => {
		expect(codes('[SHOWCASE title="X"] trailing\n[/SHOWCASE]\n')).toContain('tag-not-alone');
	});

	it('reports unclosed blocks', () => {
		expect(codes('[SHOWCASE title="X"]\n')).toContain('unclosed-block');
		expect(codes('[SHOWCASE title="X"]\n[component component={B}]\nx\n[/SHOWCASE]\n')).toContain(
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
	[component component={Nav}]
		<script>
			const a = 1;
	[/component]
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
	[component component={Nav}]
		<script>
			const a = 1;
	[/component]
[/SHOWCASE]
`);
		const codes = file.errors.map((e) => e.code);
		expect(codes).toContain('unclosed-tag');
		expect(codes).not.toContain('block-script-position');
	});
});

describe('entity-level <script> and <style>', () => {
	it('SHOWCASE: leading script and trailing style are captured', () => {
		const file = scanSdoc(`<script lang="ts">
	import Nav from './Nav.svelte';
</script>

[SHOWCASE title="Nav"]
	<script lang="ts">
		const shared = [1, 2];
	</script>

	[example title="A"]
		<Nav {shared} />
	[/example]

	<style>
		.stagewide { color: gray; }
	</style>
[/SHOWCASE]
`);
		expect(file.errors).toEqual([]);
		const e = file.entities[0];
		expect(e.script?.content).toContain('const shared');
		expect(e.style?.content).toContain('.stagewide');
		expect(e.blocks).toHaveLength(1);
	});

	it('SHOWCASE: a script after content is a position error', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[example title="A"]
		<b>x</b>
	[/example]
	<script>
		const late = 1;
	</script>
[/SHOWCASE]
`);
		expect(file.errors.map((e) => e.code)).toContain('entity-script-position');
	});

	it('SHOWCASE: a style before a block is a position error', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	<style>
		.x { color: red; }
	</style>
	[example title="A"]
		<b>x</b>
	[/example]
[/SHOWCASE]
`);
		expect(file.errors.map((e) => e.code)).toContain('entity-style-position');
	});

	it('DOC: leading script and trailing style, prose excludes both', () => {
		const file = scanSdoc(`[DOC title="Guide"]
	<script>
		const n = 1;
	</script>

	Some prose.

	[example title="A"]
		<b>{n}</b>
	[/example]

	<style>
		.doc-note { color: gray; }
	</style>
[/DOC]
`);
		expect(file.errors).toEqual([]);
		const e = file.entities[0];
		expect(e.script?.content).toContain('const n = 1');
		expect(e.style?.content).toContain('.doc-note');
		expect(e.body).toContain('Some prose.');
		expect(e.body).not.toContain('const n = 1');
		expect(e.body).not.toContain('.doc-note');
	});

	it('PAGE: entity script/style captured, body is the markup', () => {
		const file = scanSdoc(`[PAGE title="Landing"]
	<script>
		let open = $state(false);
	</script>
	<button onclick={() => (open = !open)}>toggle</button>
	<style>
		button { color: red; }
	</style>
[/PAGE]
`);
		expect(file.errors).toEqual([]);
		const e = file.entities[0];
		expect(e.script?.content).toContain('$state(false)');
		expect(e.style?.content).toContain('button { color: red; }');
		expect(e.body.trim()).toBe('<button onclick={() => (open = !open)}>toggle</button>');
	});

	it('a style inside a DOC fence stays prose', () => {
		const file = scanSdoc(`[DOC title="G"]
	Some prose.

	\`\`\`html
	<style>
		.x { }
	</style>
	\`\`\`
[/DOC]
`);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].style).toBeNull();
		expect(file.entities[0].body).toContain('<style>');
	});
});

describe('entity-level tags bounded to their own entity (review regression)', () => {
	it('an unclosed entity <style> in SHOWCASE does not swallow a later entity', () => {
		const file = scanSdoc(`[SHOWCASE title="A"]
	[example title="E"]
		<b>x</b>
	[/example]
	<style>
		.open { color: red;
[/SHOWCASE]

[PAGE title="B"]
	<script>
		let n = $state(1);
	</script>
	<b>{n}</b>
[/PAGE]

<style>
	.file { color: blue; }
</style>
`);
		const codes = file.errors.map((e) => e.code);
		expect(codes).toContain('unclosed-tag');
		expect(codes).not.toContain('unclosed-block');
		const unclosed = file.errors.find((e) => e.code === 'unclosed-tag')!;
		expect(unclosed.message).toBe('Missing </style> before [/SHOWCASE].');
		// The later entity and the file style survive intact.
		expect(file.entities.map((e) => e.kind)).toEqual(['SHOWCASE', 'PAGE']);
		expect(file.entities[1].script?.content).toContain('$state(1)');
		expect(file.entities[1].body.trim()).toBe('<b>{n}</b>');
		expect(file.style?.content).toContain('.file { color: blue; }');
	});

	it('an unclosed entity <script> in DOC does not swallow a later entity', () => {
		const file = scanSdoc(`[DOC title="G"]
	<script>
		const n = 1;

	Some prose.
[/DOC]

[PAGE title="B"]
	<script>
		let x = $state(2);
	</script>
	<b>{x}</b>
[/PAGE]
`);
		const codes = file.errors.map((e) => e.code);
		expect(codes).toContain('unclosed-tag');
		expect(codes).not.toContain('unclosed-block');
		const unclosed = file.errors.find((e) => e.code === 'unclosed-tag')!;
		expect(unclosed.message).toBe('Missing </script> before [/DOC].');
		expect(file.entities.map((e) => e.kind)).toEqual(['DOC', 'PAGE']);
		expect(file.entities[1].script?.content).toContain('$state(2)');
		expect(file.entities[1].body.trim()).toBe('<b>{x}</b>');
	});

	it('the DOC bound skips closer-looking lines inside markdown fences', () => {
		const file = scanSdoc(`[DOC title="G"]
	<script>
		const n = 1;

	\`\`\`
	[/DOC]
	\`\`\`
[/DOC]
`);
		const codes = file.errors.map((e) => e.code);
		expect(codes).toContain('unclosed-tag');
		// Recovery lands on the real closer, not the fenced one — no cascade.
		expect(codes).not.toContain('stray-closer');
		expect(codes).not.toContain('text-outside-blocks');
		expect(file.entities.map((e) => e.kind)).toEqual(['DOC']);
	});
});

describe('DOC entity style: blank-line layout (review regression)', () => {
	it('a trailing style followed by a blank line is NOT a position error', () => {
		const file = scanSdoc('[DOC title="G"]\n\tprose\n\n\t<style>\n\t\t.x { color: red; }\n\t</style>\n\n[/DOC]\n');
		expect(file.errors).toEqual([]);
		expect(file.entities[0].style).not.toBeNull();
	});
});

describe('misplaced entity <style> is not captured (double-apply regression)', () => {
	it('DOC: a style followed by more prose stays in the body as prose, once', () => {
		const src =
			'[DOC title="G"]\n\tbefore\n\n\t<style>\n\t\t.x { color: red; }\n\t</style>\n\n\tafter\n[/DOC]\n';
		const file = scanSdoc(src);
		expect(file.errors.map((e) => e.code)).toEqual(['entity-style-position']);
		const e = file.entities[0];
		expect(e.style).toBeNull();
		expect(e.body).toContain('before');
		expect(e.body).toContain('after');
		// The style renders exactly once, as authored prose.
		expect(e.body.split('<style>')).toHaveLength(2);
		expect(e.body).toContain('.x { color: red; }');
		expect(src.slice(e.bodySpan.start, e.bodySpan.end)).toBe(e.body);
	});

	it('DOC: a correctly trailing style is still captured and excluded from the body', () => {
		for (const gap of ['', '\n']) {
			const file = scanSdoc(
				`[DOC title="G"]\n\tprose\n\n\t<style>\n\t\t.x { color: red; }\n\t</style>\n${gap}[/DOC]\n`,
			);
			expect(file.errors).toEqual([]);
			const e = file.entities[0];
			expect(e.style?.content).toContain('.x { color: red; }');
			expect(e.body).toContain('prose');
			expect(e.body).not.toContain('<style>');
		}
	});

	it('SHOWCASE: a misplaced style is reported but stays captured, with no cascade', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	<style>
		.x { color: red; }
	</style>
	[example title="A"]
		<b>x</b>
	[/example]
[/SHOWCASE]
`);
		// No prose pass-through in SHOWCASE, so capture is kept: the CSS applies
		// once and the position error is the only diagnostic.
		expect(file.errors.map((e) => e.code)).toEqual(['entity-style-position']);
		expect(file.entities[0].style?.content).toContain('.x { color: red; }');
	});

	it('DOC: a fence after a captured style demotes it too (no double-apply)', () => {
		const src =
			'[DOC title="G"]\n\tbefore\n\n\t<style>\n\t\t.x { color: red; }\n\t</style>\n\n\t```js\n\tconst a = 1;\n\t```\n[/DOC]\n';
		const file = scanSdoc(src);
		expect(file.errors.map((e) => e.code)).toEqual(['entity-style-position']);
		const e = file.entities[0];
		expect(e.style).toBeNull();
		expect(e.body).toContain('before');
		expect(e.body).toContain('const a = 1;');
		// The style renders exactly once, as authored prose.
		expect(e.body.split('<style>')).toHaveLength(2);
		expect(e.body).toContain('.x { color: red; }');
		expect(src.slice(e.bodySpan.start, e.bodySpan.end)).toBe(e.body);
	});
});

describe('custom elements named like <style>/<script> (review regression)', () => {
	it('DOC prose: <styled-note> flows through, full body preserved', () => {
		const file = scanSdoc(`[DOC title="G"]
	Some prose.

	<styled-note>
		This is a note.
	</styled-note>

	More prose after.
[/DOC]
`);
		expect(file.errors).toEqual([]);
		const e = file.entities[0];
		expect(e.style).toBeNull();
		expect(e.body).toContain('<styled-note>');
		expect(e.body).toContain('</styled-note>');
		expect(e.body).toContain('More prose after.');
	});

	it('DOC prose: a leading <scripted-demo> is not an entity script', () => {
		const file = scanSdoc(`[DOC title="G"]
	<scripted-demo>x</scripted-demo>

	Prose.
[/DOC]
`);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].script).toBeNull();
		expect(file.entities[0].body).toContain('<scripted-demo>x</scripted-demo>');
		expect(file.entities[0].body).toContain('Prose.');
	});

	it('example markup: <styled-box> and <scripted-demo> stay markup', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[example title="A"]
		<scripted-demo>go</scripted-demo>
		<styled-box>hi</styled-box>
	[/example]
[/SHOWCASE]
`);
		expect(file.errors).toEqual([]);
		const block = file.entities[0].blocks[0];
		expect(block.script).toBeNull();
		expect(block.style).toBeNull();
		expect(block.markup).toContain('<scripted-demo>go</scripted-demo>');
		expect(block.markup).toContain('<styled-box>hi</styled-box>');
	});

	it('SHOWCASE body: <style-guide> is loose text, not a broken entity style', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	<style-guide>x</style-guide>
	[example title="A"]
		<b>x</b>
	[/example]
[/SHOWCASE]
`);
		const codes = file.errors.map((e) => e.code);
		expect(codes).not.toContain('unclosed-tag');
		expect(codes).not.toContain('entity-style-position');
		expect(file.entities[0].style).toBeNull();
		// The example after the custom element is not swallowed.
		expect(file.entities[0].blocks).toHaveLength(1);
	});

	it('PAGE body: custom elements are ordinary markup', () => {
		const file = scanSdoc(`[PAGE title="P"]
	<styled-note>hello</styled-note>
	<scripted-demo>run</scripted-demo>
[/PAGE]
`);
		expect(file.errors).toEqual([]);
		const e = file.entities[0];
		expect(e.script).toBeNull();
		expect(e.style).toBeNull();
		expect(e.body).toContain('<styled-note>hello</styled-note>');
		expect(e.body).toContain('<scripted-demo>run</scripted-demo>');
	});

	it('real tags with attrs and the self-closing edge are still recognized', () => {
		const withAttrs = scanSdoc(`[DOC title="G"]
	prose

	<style lang="scss">
		.x { color: red; }
	</style>
[/DOC]
`);
		expect(withAttrs.errors).toEqual([]);
		expect(withAttrs.entities[0].style?.content).toContain('.x { color: red; }');
		// `<style/>` hits the tag-name boundary too: still treated as a style
		// tag (and diagnosed), not passed through as a custom element.
		const selfClosing = scanSdoc('[DOC title="G"]\n\tprose\n\n\t<style/>\n[/DOC]\n');
		expect(selfClosing.errors.map((e) => e.code)).toContain('unclosed-tag');
	});
});

describe('quoted ">" inside tag attributes (review regression)', () => {
	it('file script: a generics attr with ">" keeps the content clean', () => {
		const src = `<script lang="ts" generics="T extends Record<string, number>">
	const first = 1;
</script>

[DOC title="G"]
	x
[/DOC]
`;
		const file = scanSdoc(src);
		expect(file.errors).toEqual([]);
		expect(file.script!.attrsText).toBe(' lang="ts" generics="T extends Record<string, number>"');
		expect(file.script!.content.split('\n')[1]).toBe('\tconst first = 1;');
		expect(file.script!.content).not.toContain('">');
	});

	it('single-quoted and unquoted attr values work too', () => {
		const single = scanSdoc(
			`<script lang='ts' generics='T extends Record<string, number>'>\n\tconst n = 1;\n</script>\n\n[DOC title="G"]\n\tx\n[/DOC]\n`,
		);
		expect(single.errors).toEqual([]);
		expect(single.script!.content.split('\n')[1]).toBe('\tconst n = 1;');
		expect(single.script!.content).not.toContain("'>");
		const unquoted = scanSdoc(
			`<script lang=ts>\n\tconst n = 1;\n</script>\n\n[DOC title="G"]\n\tx\n[/DOC]\n`,
		);
		expect(unquoted.errors).toEqual([]);
		expect(unquoted.script!.attrsText).toBe(' lang=ts');
		expect(unquoted.script!.content.split('\n')[1]).toBe('\tconst n = 1;');
	});

	it('block script: a quoted ">" attr captures cleanly (bounded tag path)', () => {
		const file = scanSdoc(`[SHOWCASE title="X"]
	[example title="A"]
		<script lang="ts" generics="T extends Record<string, number>">
			const n = 1;
		</script>
		<b>{n}</b>
	[/example]
[/SHOWCASE]
`);
		expect(file.errors).toEqual([]);
		const block = file.entities[0].blocks[0];
		expect(block.script!.attrsText).toContain('generics="T extends Record<string, number>"');
		expect(block.script!.content.split('\n')[1]).toBe('\t\t\tconst n = 1;');
		expect(block.script!.content).not.toContain('">');
		expect(block.markup).toContain('<b>{n}</b>');
	});
});

describe('fence markers are not interchangeable (review regression)', () => {
	it('a ~~~ fence containing ``` lines keeps a fenced [/DOC] as prose', () => {
		const file = scanSdoc(
			'[DOC title="G"]\n~~~\n```\n[/DOC]\n```\n~~~\ntail prose\n[/DOC]\n',
		);
		expect(file.errors).toEqual([]);
		expect(file.entities).toHaveLength(1);
		const e = file.entities[0];
		expect(e.body).toContain('tail prose');
		// Only the fenced closer sits in the body; the real one closed the entity.
		expect(e.body.split('[/DOC]')).toHaveLength(2);
	});

	it('a ~~~ fence containing an [example] block keeps it as prose', () => {
		const file = scanSdoc(
			'[DOC title="G"]\n~~~\n```\n[example title="fake"]\nx\n[/example]\n```\n~~~\n[/DOC]\n',
		);
		expect(file.errors).toEqual([]);
		expect(file.entities[0].blocks).toHaveLength(0);
		expect(file.entities[0].body).toContain('[example title="fake"]');
	});

	it('a longer backtick fence is not closed by a shorter one', () => {
		const file = scanSdoc('[DOC title="G"]\n````\n```\n[/DOC]\n```\n````\n[/DOC]\n');
		expect(file.errors).toEqual([]);
		expect(file.entities).toHaveLength(1);
		expect(file.entities[0].body.split('[/DOC]')).toHaveLength(2);
	});

	it('the DOC bound tracks fence markers separately (~~~ containing ```)', () => {
		const file = scanSdoc(
			'[DOC title="G"]\n<script>\nconst n = 1;\n\n~~~\n```\n[/DOC]\n```\n~~~\n[/DOC]\n',
		);
		const codes = file.errors.map((e) => e.code);
		expect(codes).toContain('unclosed-tag');
		// Recovery lands on the real closer, not the fenced one — no cascade.
		expect(codes).not.toContain('stray-closer');
		expect(codes).not.toContain('text-outside-blocks');
		expect(file.entities.map((e) => e.kind)).toEqual(['DOC']);
	});
});

/**
 * A quoted attribute value stops at the line break.
 *
 * The search for the closing quote used to run to end of file, so a missing
 * `"` was closed by the next one anywhere in the document — usually the one on
 * a later entity's opener. Everything between became the value: the blocks in
 * that range vanished, the opener's span stretched across them, and the four
 * diagnostics that came out were all downstream of a mistake none of them
 * pointed at.
 *
 * `script-scan.ts` has always had this rule for `'`/`"` strings in a script.
 * The attribute scanner is the one place that opted out of it, and out of the
 * recovery policy `recoverOpenerEnd` exists for.
 */
describe('an unterminated attribute value', () => {
	const BROKEN = [
		'[SHOWCASE title="Button]',
		'',
		'\t[EXAMPLE title="Primary"]',
		'\t\t<b>x</b>',
		'\t[/EXAMPLE]',
		'',
		'[/SHOWCASE]',
		'',
	].join('\n');

	it('reports once, on the opening quote', () => {
		const file = scanSdoc(BROKEN);
		expect(file.errors).toHaveLength(1);
		const [err] = file.errors;
		expect(err.code).toBe('unterminated-attr-string');
		// Offset 16 is the `"` itself — not the attribute name, and not a span
		// running to the end of the file, which is what it used to report.
		expect(BROKEN[err.span.start]).toBe('"');
		expect(err.span.end - err.span.start).toBe(1);
	});

	it('recovers the rest of the document', () => {
		const file = scanSdoc(BROKEN);
		expect(file.entities).toHaveLength(1);
		// The `]` still on that line closes the opener, so the title reads as
		// written rather than carrying the bracket.
		expect(file.entities[0].attrs.title?.raw).toBe('Button');
		// And the block inside it is still there — it used to be swallowed.
		expect(file.entities[0].blocks).toHaveLength(1);
	});

	it('still accepts a value that closes on its own line', () => {
		const file = scanSdoc('[SHOWCASE title="Forms / Button"]\n[/SHOWCASE]\n');
		expect(file.errors).toEqual([]);
		expect(file.entities[0].attrs.title?.raw).toBe('Forms / Button');
	});

	it('does not mistake a later quote for the closer', () => {
		// The `"` four lines down used to close this value.
		const file = scanSdoc(
			'[SHOWCASE title="First]\n\n[/SHOWCASE]\n\n[DOC title="Second"]\n\ttext\n[/DOC]\n',
		);
		expect(file.entities.map((e) => e.attrs.title?.raw)).toEqual(['First', 'Second']);
	});
});
