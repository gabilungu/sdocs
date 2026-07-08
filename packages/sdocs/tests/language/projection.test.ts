import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { scanSdoc } from '../../src/lib/language/scanner.js';
import { projectSdoc, projectSdocBlocks } from '../../src/lib/language/projection.js';

const SOURCE = `<script lang="ts">
	import Tabs from './Tabs.svelte';
	import Tab from './Tab.svelte';
	const shared = 1;
</script>

[SHOWCASE title="Nav / Tabs" description="A tab bar."]

	[preview component={Tabs} args={{ active: 0 }}]
		<Tabs {...args} active={shared}>x</Tabs>
	[/preview]

	[example title="Wrapped child"]
		<Tabs><Tab {...args} /></Tabs>
	[/example]

[/SHOWCASE]

[DOC title="Guide"]

	## Heading

	Uses {shared} and <Tabs />.

	\`\`\`svelte
	<NotReal {broken} />
	\`\`\`

	Inline \`{code}\` is masked.

[/DOC]

<style>
	.x { color: red; }
</style>
`;

describe('projectSdoc', () => {
	const projection = projectSdoc(scanSdoc(SOURCE));
	const lines = projection.text.split('\n');
	const sourceLines = SOURCE.split('\n');

	it('preserves every authored line position', () => {
		expect(projection.sourceLineCount).toBe(sourceLines.length);
		for (let i = 0; i < sourceLines.length; i++) {
			const kind = projection.lineKinds[i];
			if (kind === 'verbatim') expect(lines[i]).toBe(sourceLines[i]);
			if (kind === 'blank') expect(lines[i]).toBe('');
		}
	});

	const at = (needle: string) => sourceLines.findIndex((l) => l.includes(needle));

	it('keeps script, style, and bodies verbatim at identical lines', () => {
		expect(lines[1]).toBe("\timport Tabs from './Tabs.svelte';");
		expect(lines[at('{...args} active')]).toBe(sourceLines[at('{...args} active')]);
		expect(lines[at('color: red')]).toContain('color: red');
	});

	it('rewrites sub-block openers to snippet wrappers in place', () => {
		expect(lines[at('[preview')]).toBe('{#snippet __sdocs$0_0(args: any)}');
		expect(lines[at('[/preview]')]).toBe('{/snippet}');
		expect(lines[at('[example')]).toBe('{#snippet __sdocs$0_1(args: any)}');
	});

	it('blanks entity tags and masks PAGE code while keeping prose live', () => {
		expect(lines[at('[SHOWCASE')]).toBe('');
		const proseLine = sourceLines.findIndex((l) => l.includes('Uses {shared}'));
		expect(lines[proseLine]).toBe(sourceLines[proseLine]);
		const fenceBody = sourceLines.findIndex((l) => l.includes('NotReal'));
		expect(lines[fenceBody]).toBe('');
		const inline = sourceLines.findIndex((l) => l.includes('Inline'));
		expect(lines[inline]).not.toContain('{code}');
		expect(lines[inline].length).toBe(sourceLines[inline].length);
	});

	it('appends a trailer that renders snippets and references components', () => {
		const trailer = lines.slice(projection.sourceLineCount).join('\n');
		expect(trailer).toContain('{@render __sdocs$0_0({})}');
		expect(trailer).toContain('{@render __sdocs$1()}');
		expect(trailer).toContain('<Tabs />');
	});

	it('produces text the Svelte compiler accepts', () => {
		expect(() => compile(projection.text, { generate: false } as never)).not.toThrow();
	});
});

describe('projectSdoc over the real corpus', () => {
	const dirs = [
		resolve(__dirname, '../../../../apps/docs/src'),
		resolve(__dirname, '../../../../apps/testapp-embedded/src/lib/UI'),
		resolve(__dirname, '../../../../apps/testapp-standalone/src'),
	];
	const files: string[] = [];
	for (const dir of dirs) {
		try {
			for (const f of readdirSync(dir, { recursive: true }) as string[]) {
				if (f.endsWith('.sdoc')) files.push(resolve(dir, f));
			}
		} catch {
			// corpus dir not present in this checkout
		}
	}

	it('found the corpus', () => {
		expect(files.length).toBeGreaterThanOrEqual(10);
	});

	for (const file of files) {
		it(`compiles ${file.split('/').slice(-1)[0]}`, () => {
			const source = readFileSync(file, 'utf-8');
			const projection = projectSdoc(scanSdoc(source));
			expect(projection.sourceLineCount).toBe(source.split('\n').length);
			expect(() => compile(projection.text, { generate: false } as never)).not.toThrow();
		});
	}
});

describe('projectSdocBlocks (per-block virtual docs)', () => {
	const BLOCK_SOURCE = `<script lang="ts">
	import Nav from './Nav.svelte';
	const shared = 1;
</script>

[SHOWCASE title="Nav"]

	[example title="Data"]
		<script lang="ts">
			const items = [{ label: "Home" }];
			let active = $state("Home");
		</script>
		<Nav {items} {active} extra={shared} />
		<span class="hint">{args.x ?? ''}</span>
		<style>
			.hint { color: gray; }
		</style>
	[/example]

	[example title="Plain"]
		<Nav />
	[/example]

	[example title="StyleOnly"]
		<span class="big">hi</span>
		<style>
			.big { font-size: 2em; }
		</style>
	[/example]

[/SHOWCASE]
`;

	const file = scanSdoc(BLOCK_SOURCE);
	const blocks = projectSdocBlocks(file);
	const sourceLines = BLOCK_SOURCE.split('\n');

	it('creates a projection only for script/style-bearing blocks', () => {
		expect(blocks.map((b) => b.key)).toEqual(['0_0', '0_2']);
	});

	it('preserves every authored line position (identity mapping)', () => {
		for (const bp of blocks) {
			const lines = bp.text.split('\n');
			expect(bp.sourceLineCount).toBe(sourceLines.length);
			for (let i = 0; i < sourceLines.length; i++) {
				if (bp.lineKinds[i] === 'verbatim') expect(lines[i]).toBe(sourceLines[i]);
				if (bp.lineKinds[i] === 'blank') expect(lines[i]).toBe('');
			}
		}
	});

	it('merges file and block scripts into one component script', () => {
		const bp = blocks[0];
		const lines = bp.text.split('\n');
		// file script content verbatim at its lines
		expect(lines[1]).toBe("\timport Nav from './Nav.svelte';");
		expect(lines[2]).toBe('\tconst shared = 1;');
		// the file </script> and the block <script> opener are blanked
		expect(lines[3]).toBe('');
		// block script content verbatim
		const itemsLine = sourceLines.findIndex((l) => l.includes('const items'));
		expect(lines[itemsLine]).toBe(sourceLines[itemsLine]);
		// the block script closer becomes the real closer + snippet opener
		const closeLine = sourceLines.findIndex((l, i) => i > itemsLine && l.includes('</script>'));
		expect(lines[closeLine]).toContain('</script>{#snippet');
		expect(lines[closeLine]).toContain('(args: any)');
	});

	it('turns the block style into the component style', () => {
		const bp = blocks[0];
		const lines = bp.text.split('\n');
		const styleOpen = sourceLines.findIndex((l) => l.trim() === '<style>');
		expect(lines[styleOpen]).toBe('{/snippet}<style>');
		const cssLine = sourceLines.findIndex((l) => l.includes('.hint {'));
		expect(lines[cssLine]).toBe(sourceLines[cssLine]);
	});

	it('every block projection compiles as a Svelte component (runes included)', () => {
		for (const bp of blocks) {
			const compiled = compile(bp.text, { generate: 'client' });
			expect(compiled.js.code).toBeTruthy();
		}
	});

	it('a style-only block keeps the file script closed and unextended', () => {
		const bp = blocks.find((b) => b.key === '0_2')!;
		const lines = bp.text.split('\n');
		expect(lines[3]).toBe('</script>'); // file closer intact
		const openerLine = sourceLines.findIndex((l) => l.includes('title="StyleOnly"'));
		expect(lines[openerLine]).toContain('{#snippet');
	});

	it('owned ranges cover opener through closer', () => {
		const bp = blocks[0];
		expect(sourceLines[bp.firstLine]).toContain('[example title="Data"]');
		expect(sourceLines[bp.lastLine]).toContain('[/example]');
	});
});

describe('projectSdocBlocks: single-line tags (review regressions)', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('keeps a one-liner block script, with a file script', () => {
		const src = `<script lang="ts">\n\tconst shared = 1;\n</script>\n\n[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>let count = $state(7);</script>\n\t\t<b>{count}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		expect(bp.text).toContain('let count = $state(7);</script>{#snippet');
		compileOk(bp.text);
	});

	it('keeps a one-liner block script with NO file script', () => {
		const src = `[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>let count = $state(7);</script>\n\t\t<b>{count}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		expect(bp.text).toContain('<script>let count = $state(7);</script>{#snippet');
		compileOk(bp.text);
	});

	it('keeps a declaration sharing a multi-line script closer line', () => {
		const src = `[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\tlet a = 1;\n\t\t\tlet b = 2;</script>\n\t\t<b>{a}{b}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		expect(bp.text).toContain('let b = 2;</script>{#snippet');
		compileOk(bp.text);
	});

	it('survives a ONE-LINE file script when a block declares its own', () => {
		const src = `<script>import X from './X.svelte';</script>\n\n[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\tlet n = 1;\n\t\t</script>\n\t\t<X {n} />\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		expect(bp.text).toContain("<script>import X from './X.svelte';");
		compileOk(bp.text);
	});

	it('keeps a one-liner block style closed and content intact', () => {
		const src = `[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<b class="x">hi</b>\n\t\t<style>.x { color: red; }</style>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		expect(bp.text).toContain('{/snippet}<style>.x { color: red; }</style>');
		compileOk(bp.text);
	});
});

describe('projectSdocBlocks: lang preservation', () => {
	it('a TS block script inside a plain-JS file script carries lang="ts"', () => {
		const src = `<script>
	const shared = 1;
</script>

[SHOWCASE title="X"]
	[example title="A"]
		<script lang="ts">
			const n: number = shared;
		</script>
		<b>{n}</b>
	[/example]
[/SHOWCASE]
`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		expect(bp.text).toContain('<script lang="ts">');
		expect(bp.text).toContain('(args: any)');
		expect(compile(bp.text, { generate: 'client' }).js.code).toBeTruthy();
	});
});

describe('projectSdocBlocks: entity-level script chain', () => {
	const SRC = `<script lang="ts">
	import Nav from './Nav.svelte';
</script>

[SHOWCASE title="X"]
	<script>
		const shared = [1, 2];
	</script>

	[example title="Uses entity scope"]
		<Nav items={shared} />
	[/example]

	[example title="Own script too"]
		<script>
			let n = $state(shared.length);
		</script>
		<b>{n}</b>
	[/example]
[/SHOWCASE]

[PAGE title="P"]
	<script>
		let open = $state(false);
	</script>
	<button onclick={() => (open = !open)}>{open}</button>
	<style>
		button { color: red; }
	</style>
[/PAGE]
`;
	const blocks = projectSdocBlocks(scanSdoc(SRC));
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('a block WITHOUT its own script still gets a doc when the entity has one', () => {
		expect(blocks.map((b) => b.key)).toEqual(['0_0', '0_1', '1']);
	});

	it('the chain file→entity→block merges into one compiling script', () => {
		for (const bp of blocks) compileOk(bp.text);
		const own = blocks[1].text;
		expect(own).toContain('const shared = [1, 2];');
		expect(own).toContain('let n = $state(shared.length);');
		expect(own).toContain('</script>{#snippet __sdocs$0_1(args: any)}');
	});

	it('entity script lines are owned by exactly one doc', () => {
		const withExtra = blocks.filter((b) => (b.extraOwnedLines?.length ?? 0) > 0);
		expect(withExtra).toHaveLength(1);
		expect(withExtra[0].key).toBe('0_0');
	});

	it('a PAGE with entity script/style projects as a full component', () => {
		const pg = blocks.find((b) => b.key === '1')!;
		expect(pg.text).toContain('let open = $state(false);');
		expect(pg.text).toContain('</script>');
		expect(pg.text).toContain('button { color: red; }');
		compileOk(pg.text);
	});
});

describe('projectSdocBlocks: DOC per-entity doc', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('a DOC entity script with ZERO examples still gets an entity doc, prose included', () => {
		const src = `[DOC title="Guide"]
	<script lang="ts">
		const answer = 42;
	</script>

	The answer is {answer}.

[/DOC]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0']);
		const doc = blocks[0];
		const sourceLines = src.split('\n');
		const lines = doc.text.split('\n');
		// The chained entity script is real script, its errors reportable here.
		expect(doc.text).toContain('const answer = 42;');
		expect(doc.text).toContain('</script>{#snippet __sdocs$0()}');
		// The prose line stays verbatim at its authored position, in scope.
		const proseLine = sourceLines.findIndex((l) => l.includes('The answer is'));
		expect(lines[proseLine]).toBe(sourceLines[proseLine]);
		expect(doc.lineKinds[proseLine]).toBe('verbatim');
		// The doc owns the whole entity: opener through closer.
		expect(doc.firstLine).toBe(0);
		expect(sourceLines[doc.lastLine]).toContain('[/DOC]');
		compileOk(doc.text);
	});

	it('a DOC with examples blanks them in the entity doc; blocks keep their own docs', () => {
		const src = `<script lang="ts">
	import Nav from './Nav.svelte';
</script>

[DOC title="G"]
	<script>
		const answer = 42;
	</script>

	The answer is {answer}.

	[example title="A"]
		<Nav />
	[/example]

	Tail prose {answer}.

	<style>
		.doc-note { color: gray; }
	</style>
[/DOC]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0']);
		const doc = blocks[0];
		const sourceLines = src.split('\n');
		const lines = doc.text.split('\n');
		expect(doc.text).toContain('const answer = 42;');
		const prose = sourceLines.findIndex((l) => l.includes('The answer is'));
		const tail = sourceLines.findIndex((l) => l.includes('Tail prose'));
		expect(lines[prose]).toBe(sourceLines[prose]);
		expect(lines[tail]).toBe(sourceLines[tail]);
		// Example lines are blank here — the block's own doc owns them.
		const nav = sourceLines.findIndex((l) => l.includes('<Nav />'));
		expect(lines[nav]).toBe('');
		expect(blocks[1].text.split('\n')[nav]).toBe(sourceLines[nav]);
		// The entity style is this component's real style.
		expect(doc.text).toContain('{/snippet}<style>');
		const css = sourceLines.findIndex((l) => l.includes('.doc-note'));
		expect(lines[css]).toBe(sourceLines[css]);
		// The entity doc owns the entity script lines — no block claims them.
		expect(blocks.every((b) => (b.extraOwnedLines?.length ?? 0) === 0)).toBe(true);
		compileOk(doc.text);
		compileOk(blocks[1].text);
	});

	it('a style-only DOC gives script-less examples their own docs (nothing goes dark)', () => {
		const src = `[DOC title="G"]
	Prose.

	[example title="A"]
		<b class="doc-note">hi</b>
	[/example]

	<style>
		.doc-note { color: gray; }
	</style>
[/DOC]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0']);
		const sourceLines = src.split('\n');
		const markup = sourceLines.findIndex((l) => l.includes('class="doc-note"'));
		expect(blocks[1].text.split('\n')[markup]).toBe(sourceLines[markup]);
		compileOk(blocks[0].text);
		compileOk(blocks[1].text);
	});
});

describe('projectSdocBlocks: SHOWCASE entity style/script docs', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('the entity style lands in a real <style>, checked against every block markup', () => {
		const src = `[SHOWCASE title="X"]
	<script>
		const shared = 1;
	</script>

	[example title="A"]
		<b class="big">{shared}</b>
	[/example]

	<style>
		.big { font-size: 2em; }
	</style>
[/SHOWCASE]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0']);
		const doc = blocks[0];
		const sourceLines = src.split('\n');
		const lines = doc.text.split('\n');
		expect(lines[sourceLines.findIndex((l) => l.trim() === '<style>')]).toBe('<style>');
		const css = sourceLines.findIndex((l) => l.includes('.big {'));
		expect(lines[css]).toBe(sourceLines[css]);
		// The block markup is present so the selector reads as used.
		const markup = sourceLines.findIndex((l) => l.includes('class="big"'));
		expect(lines[markup]).toBe(sourceLines[markup]);
		// This doc owns exactly the style lines; the entity script stays with
		// the first block doc.
		expect(sourceLines[doc.firstLine].trim()).toBe('<style>');
		expect(sourceLines[doc.lastLine].trim()).toBe('</style>');
		expect(blocks[1].extraOwnedLines?.length).toBeGreaterThan(0);
		compileOk(doc.text);
	});

	it('a SHOWCASE entity script with zero blocks still gets a doc', () => {
		const src = `[SHOWCASE title="X"]
	<script lang="ts">
		const n: number = 1;
	</script>
[/SHOWCASE]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0']);
		const doc = blocks[0];
		expect(doc.text).toContain('const n: number = 1;');
		expect(doc.text).toContain('</script>');
		const sourceLines = src.split('\n');
		expect(sourceLines[doc.firstLine]).toContain('<script');
		expect(sourceLines[doc.lastLine]).toContain('</script>');
		compileOk(doc.text);
	});
});

describe('projectSdocBlocks: inner chained script sharing its opener line', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('keeps declarations on the opening line of an inner chained script', () => {
		const src = `<script>
	const shared = 1;
</script>

[SHOWCASE title="X"]
	[example title="A"]
		<script>let b = 2;
			let c = 3;
		</script>
		<b>{b}{c}{shared}</b>
	[/example]
[/SHOWCASE]
`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = bp.text.split('\n');
		const openLine = sourceLines.findIndex((l) => l.includes('let b = 2;'));
		// The tag is blanked but the declaration survives at its column.
		expect(lines[openLine]).toContain('let b = 2;');
		expect(lines[openLine].indexOf('let b = 2;')).toBe(sourceLines[openLine].indexOf('let b = 2;'));
		expect(lines[openLine]).not.toContain('<script');
		expect(bp.text).toContain('let c = 3;');
		compileOk(bp.text);
	});

	it('keeps a single-line inner chained script at its authored column', () => {
		const src = `<script>
	const shared = 1;
</script>

[SHOWCASE title="X"]
	<script>const shift = shared + 1;</script>

	[example title="A"]
		<b>{shift}</b>
	[/example]
[/SHOWCASE]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		const bp = blocks.find((b) => b.key === '0_0')!;
		const sourceLines = src.split('\n');
		const lines = bp.text.split('\n');
		const line = sourceLines.findIndex((l) => l.includes('const shift'));
		expect(lines[line]).toContain('const shift = shared + 1;');
		expect(lines[line].indexOf('const shift')).toBe(sourceLines[line].indexOf('const shift'));
		compileOk(bp.text);
	});
});

describe('projectSdoc: DOC entity script/style stay out of the base doc', () => {
	it('blanks entity script and style lines in a DOC with examples', () => {
		const src = `[DOC title="G"]
	<script>
		const answer = 42;
	</script>

	The answer is {answer}.

	[example title="A"]
		<b>x</b>
	[/example]

	<style>
		.doc-note { color: gray; }
	</style>
[/DOC]
`;
		const projection = projectSdoc(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = projection.text.split('\n');
		expect(lines[sourceLines.findIndex((l) => l.includes('const answer'))]).toBe('');
		expect(lines[sourceLines.findIndex((l) => l.includes('.doc-note'))]).toBe('');
		// Prose is still live in the base doc (ownership decides who publishes).
		const prose = sourceLines.findIndex((l) => l.includes('The answer is'));
		expect(lines[prose]).toBe(sourceLines[prose]);
		expect(() => compile(projection.text, { generate: false } as never)).not.toThrow();
	});
});
