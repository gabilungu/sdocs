import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { scanSdoc } from '../../src/lib/language/scanner.js';
import { projectSdoc, projectSdocBlocks } from '../../src/lib/language/projection.js';

/** Mirror the language server's owner[] fill (push order: ranges, then
 * extraOwnedLines): per authored line, the index of the block projection
 * that speaks for it, or -1 for the base projection. */
const ownersOf = (blocks: ReturnType<typeof projectSdocBlocks>, lineCount: number): number[] => {
	const owner: number[] = new Array(lineCount).fill(-1);
	blocks.forEach((b, i) => {
		for (let l = b.firstLine; l <= b.lastLine; l++) owner[l] = i;
		for (const l of b.extraOwnedLines ?? []) owner[l] = i;
	});
	return owner;
};

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
		// The emitted opener pads over the authored `\t\t` indent so the content
		// keeps its exact authored columns.
		expect(bp.text).toContain('<script>  let count = $state(7);</script>{#snippet');
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
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0', '0_1', '1']);
	});

	it('the chain file→entity→block merges into one compiling script', () => {
		for (const bp of blocks) compileOk(bp.text);
		const own = blocks.find((b) => b.key === '0_1')!.text;
		expect(own).toContain('const shared = [1, 2];');
		expect(own).toContain('let n = $state(shared.length);');
		expect(own).toContain('</script>{#snippet __sdocs$0_1(args: any)}');
	});

	it('entity script lines are owned by the per-entity doc, exactly once', () => {
		const sourceLines = SRC.split('\n');
		const owner = ownersOf(blocks, sourceLines.length);
		const entityIdx = blocks.findIndex((b) => b.key === '0');
		const sharedLine = sourceLines.findIndex((l) => l.includes('const shared = [1, 2];'));
		expect(owner[sharedLine]).toBe(entityIdx);
		// Block docs own only their own ranges — no extraOwnedLines claims.
		for (const b of blocks) {
			if (b.key.includes('_')) expect(b.extraOwnedLines ?? []).toEqual([]);
		}
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

	it('a DOC with examples includes their markup as snippets; blocks keep their own docs', () => {
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
		// Example markup is present (snippet-wrapped and rendered by the
		// trailer, so the entity import reads as used) — but the block's own
		// doc still OWNS those lines, so its diagnostics win there.
		const nav = sourceLines.findIndex((l) => l.includes('<Nav />'));
		expect(lines[nav]).toBe(sourceLines[nav]);
		const opener = sourceLines.findIndex((l) => l.includes('[example'));
		expect(lines[opener]).toBe('{/snippet}{#snippet __sdocs$0_0(args: any)}');
		expect(doc.text).toContain('{@render __sdocs$0_0({})}');
		expect(blocks[1].text.split('\n')[nav]).toBe(sourceLines[nav]);
		const owner = ownersOf(blocks, sourceLines.length);
		expect(owner[nav]).toBe(1);
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
		const styleOpen = sourceLines.findIndex((l) => l.trim() === '<style>');
		expect(lines[styleOpen]).toBe(sourceLines[styleOpen]);
		const css = sourceLines.findIndex((l) => l.includes('.big {'));
		expect(lines[css]).toBe(sourceLines[css]);
		// The block markup is present so the selector reads as used.
		const markup = sourceLines.findIndex((l) => l.includes('class="big"'));
		expect(lines[markup]).toBe(sourceLines[markup]);
		// This doc owns the style lines PLUS the entity script lines (via
		// extraOwnedLines); the block doc owns only its own range.
		expect(sourceLines[doc.firstLine].trim()).toBe('<style>');
		expect(sourceLines[doc.lastLine].trim()).toBe('</style>');
		const owner = ownersOf(blocks, sourceLines.length);
		const scriptLine = sourceLines.findIndex((l) => l.includes('const shared'));
		expect(owner[scriptLine]).toBe(0);
		expect(blocks[1].extraOwnedLines ?? []).toEqual([]);
		expect(owner[markup]).toBe(1);
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

describe('projectSdocBlocks: entity imports used only by later blocks', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('a SHOWCASE entity doc sees every block markup, so a later-block import reads as used', () => {
		const src = `[SHOWCASE title="X"]
	<script lang="ts">
		import Notice from './Notice.svelte';
	</script>

	[example title="Plain"]
		<b>plain</b>
	[/example]

	[example title="Uses it"]
		<Notice />
	[/example]
[/SHOWCASE]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0', '0_1']);
		const doc = blocks[0];
		const sourceLines = src.split('\n');
		// The doc owning the import line carries BOTH blocks' markup, wrapped
		// in snippets the trailer renders — the import reads as used.
		expect(doc.text).toContain("import Notice from './Notice.svelte';");
		expect(doc.text).toContain('<b>plain</b>');
		expect(doc.text).toContain('<Notice />');
		expect(doc.text).toContain('{@render __sdocs$0_0({})}');
		expect(doc.text).toContain('{@render __sdocs$0_1({})}');
		// Ownership: the entity doc speaks for the script lines, the block
		// docs for their own ranges.
		const owner = ownersOf(blocks, sourceLines.length);
		const importLine = sourceLines.findIndex((l) => l.includes('import Notice'));
		expect(owner[importLine]).toBe(0);
		const noticeLine = sourceLines.findIndex((l) => l.includes('<Notice />'));
		expect(owner[noticeLine]).toBe(2);
		for (const bp of blocks) compileOk(bp.text);
	});

	it('a DOC entity doc includes example markup, so an example-only import reads as used', () => {
		const src = `[DOC title="G"]
	<script lang="ts">
		import Notice from './Notice.svelte';
	</script>

	Prose before.

	[example title="A"]
		<Notice />
	[/example]

	Prose after.
[/DOC]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0']);
		const doc = blocks[0];
		const sourceLines = src.split('\n');
		const lines = doc.text.split('\n');
		const noticeLine = sourceLines.findIndex((l) => l.includes('<Notice />'));
		expect(lines[noticeLine]).toBe(sourceLines[noticeLine]);
		expect(doc.text).toContain('{@render __sdocs$0_0({})}');
		// Prose around the example still lives in its snippets.
		expect(doc.text).toContain('Prose before.');
		expect(doc.text).toContain('Prose after.');
		// The block doc still owns the example lines.
		const owner = ownersOf(blocks, sourceLines.length);
		expect(owner[noticeLine]).toBe(1);
		const importLine = sourceLines.findIndex((l) => l.includes('import Notice'));
		expect(owner[importLine]).toBe(0);
		compileOk(doc.text);
		compileOk(blocks[1].text);
	});

	it('block markup referencing block-script vars stays owned by the block doc', () => {
		// The entity doc copies block markup WITHOUT the block script, so a
		// reference like {local} is undeclared there — but those lines belong
		// to the block doc (which has the script), so the entity doc's
		// diagnostics on them never surface.
		const src = `[SHOWCASE title="X"]
	<script lang="ts">
		import Notice from './Notice.svelte';
	</script>

	[example title="Scripted"]
		<script lang="ts">
			const local = 3;
		</script>
		<b>{local}</b>
		<Notice />
	[/example]
[/SHOWCASE]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0', '0_0']);
		const doc = blocks[0];
		const sourceLines = src.split('\n');
		expect(doc.text).toContain('<b>{local}</b>');
		expect(doc.text).not.toContain('const local');
		const owner = ownersOf(blocks, sourceLines.length);
		const localLine = sourceLines.findIndex((l) => l.includes('<b>{local}</b>'));
		expect(owner[localLine]).toBe(1);
		const importLine = sourceLines.findIndex((l) => l.includes('import Notice'));
		expect(owner[importLine]).toBe(0);
		// Both docs still compile in isolation.
		compileOk(doc.text);
		compileOk(blocks[1].text);
	});
});

describe('projectSdocBlocks: style openers carrying content', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('keeps head content of a multi-line block style', () => {
		const src = `[SHOWCASE title="X"]
	[example title="A"]
		<b class="x">hi</b>
		<style>.x {
			color: red;
		}
		</style>
	[/example]
[/SHOWCASE]
`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = bp.text.split('\n');
		const open = sourceLines.findIndex((l) => l.includes('<style>.x {'));
		expect(lines[open]).toBe('{/snippet}<style>.x {');
		expect(lines[open + 1]).toBe(sourceLines[open + 1]);
		expect(bp.text).toContain('color: red;');
		compileOk(bp.text);
	});

	it('keeps head content of a PAGE entity style at authored columns', () => {
		const src = `[PAGE title="P"]
	<button class="x">hi</button>
	<style>.x {
		color: red;
	}
	</style>
[/PAGE]
`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		expect(blocks.map((b) => b.key)).toEqual(['0']);
		const sourceLines = src.split('\n');
		const lines = blocks[0].text.split('\n');
		const open = sourceLines.findIndex((l) => l.includes('<style>.x {'));
		// No prefix on a PAGE style: the recomposed opener IS the authored line.
		expect(lines[open]).toBe(sourceLines[open]);
		compileOk(blocks[0].text);
	});

	it('keeps head content of SHOWCASE and DOC entity styles', () => {
		const showcase = `[SHOWCASE title="X"]
	[example title="A"]
		<b class="big">hi</b>
	[/example]

	<style>.big {
		font-size: 2em;
	}
	</style>
[/SHOWCASE]
`;
		const sBlocks = projectSdocBlocks(scanSdoc(showcase));
		const sDoc = sBlocks.find((b) => b.key === '0')!;
		const sLines = sDoc.text.split('\n');
		const sOpen = showcase.split('\n').findIndex((l) => l.includes('<style>.big {'));
		expect(sLines[sOpen]).toBe(showcase.split('\n')[sOpen]);
		compileOk(sDoc.text);

		const docSrc = `[DOC title="G"]
	Prose <span class="doc-note">x</span>.

	<style>.doc-note {
		color: gray;
	}
	</style>
[/DOC]
`;
		const dBlocks = projectSdocBlocks(scanSdoc(docSrc));
		const dDoc = dBlocks.find((b) => b.key === '0')!;
		const dLines = dDoc.text.split('\n');
		const dOpen = docSrc.split('\n').findIndex((l) => l.includes('<style>.doc-note {'));
		expect(dLines[dOpen]).toBe('{/snippet}<style>.doc-note {');
		compileOk(dDoc.text);
	});

	it('single-line styles still recompose everywhere', () => {
		const page = `[PAGE title="P"]
	<b class="x">hi</b>
	<style>.x { color: red; }</style>
[/PAGE]
`;
		const [pg] = projectSdocBlocks(scanSdoc(page));
		expect(pg.text).toContain('<style>.x { color: red; }</style>');
		compileOk(pg.text);
	});
});

describe('projectSdocBlocks: recomposed content spans (column-preserving)', () => {
	const compileOk = (text: string) => expect(compile(text, { generate: 'client' }).js.code).toBeTruthy();

	it('a single-line BLOCK script keeps its content at authored columns, span recorded', () => {
		const src = `[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script lang="ts">const bad: string = 1;</script>\n\t\t<b>{bad}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = bp.text.split('\n');
		const line = sourceLines.findIndex((l) => l.includes('const bad'));
		const col = sourceLines[line].indexOf('const bad');
		expect(lines[line].indexOf('const bad')).toBe(col);
		expect(bp.lineKinds[line]).toBe('recomposed');
		expect(bp.contentSpans?.[line]).toEqual({
			start: col,
			end: col + 'const bad: string = 1;'.length,
		});
		compileOk(bp.text);
	});

	it('a single-line ENTITY script keeps its content at authored columns in its entity doc', () => {
		const src = `[SHOWCASE title="X"]\n\t<script lang="ts">const n: number = 1;</script>\n\n\t[example title="A"]\n\t\t<b>{n}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const blocks = projectSdocBlocks(scanSdoc(src));
		const doc = blocks.find((b) => b.key === '0')!;
		const sourceLines = src.split('\n');
		const lines = doc.text.split('\n');
		const line = sourceLines.findIndex((l) => l.includes('const n'));
		const col = sourceLines[line].indexOf('const n');
		expect(lines[line].indexOf('const n')).toBe(col);
		expect(doc.lineKinds[line]).toBe('recomposed');
		expect(doc.contentSpans?.[line]).toEqual({
			start: col,
			end: col + 'const n: number = 1;'.length,
		});
		// The entity doc owns the script line, so its span is the live one.
		expect(doc.firstLine).toBe(line);
		compileOk(doc.text);
	});

	it('an inner script opener sharing content records the span at authored columns', () => {
		const src = `<script>\n\tconst shared = 1;\n</script>\n\n[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>let b = 2;\n\t\t\tlet c = 3;</script>\n\t\t<b>{b}{c}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = bp.text.split('\n');
		// Opener line: the tag blanks, `let b = 2;` stays at its column.
		const openLine = sourceLines.findIndex((l) => l.includes('let b = 2;'));
		const openCol = sourceLines[openLine].indexOf('let b = 2;');
		expect(lines[openLine].indexOf('let b = 2;')).toBe(openCol);
		expect(bp.lineKinds[openLine]).toBe('recomposed');
		expect(bp.contentSpans?.[openLine]).toEqual({ start: openCol, end: openCol + 'let b = 2;'.length });
		// Closer line: `\t\t\tlet c = 3;` before the dropped </script>, from col 0.
		const closeLine = sourceLines.findIndex((l) => l.includes('let c = 3;'));
		expect(lines[closeLine].startsWith('\t\t\tlet c = 3;')).toBe(true);
		expect(bp.lineKinds[closeLine]).toBe('recomposed');
		expect(bp.contentSpans?.[closeLine]).toEqual({ start: 0, end: '\t\t\tlet c = 3;'.length });
		compileOk(bp.text);
	});

	it('a first-script closer sharing content records the span from column 0', () => {
		const src = `[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\tlet a = 1;</script>\n\t\t<b>{a}</b>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = bp.text.split('\n');
		const line = sourceLines.findIndex((l) => l.includes('let a = 1;'));
		expect(lines[line].startsWith('\t\t\tlet a = 1;')).toBe(true);
		expect(bp.lineKinds[line]).toBe('recomposed');
		expect(bp.contentSpans?.[line]).toEqual({ start: 0, end: '\t\t\tlet a = 1;'.length });
		compileOk(bp.text);
	});

	it('pure wrapper lines carry no span; overflowing grafts stay gated wrappers', () => {
		// Multi-line script: plain opener/closer lines keep their old kinds.
		const src = `[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\tlet a = 1;\n\t\t</script>\n\t\t<b>{a}</b>\n\t\t<style>.x { color: red; }</style>\n\t[/example]\n[/SHOWCASE]\n`;
		const [bp] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const closer = sourceLines.findIndex((l) => l.trim() === '</script>');
		expect(bp.lineKinds[closer]).toBe('wrapper');
		expect(bp.contentSpans?.[closer]).toBeUndefined();
		// The single-line style needs a '{/snippet}' graft that outgrows the
		// authored prefix: content survives adjacent, but stays a gated wrapper
		// (no span — identity mapping is impossible there).
		const styleLine = sourceLines.findIndex((l) => l.includes('<style>'));
		expect(bp.text).toContain('{/snippet}<style>.x { color: red; }</style>');
		expect(bp.lineKinds[styleLine]).toBe('wrapper');
		expect(bp.contentSpans?.[styleLine]).toBeUndefined();
		compileOk(bp.text);
	});

	it('a single-line PAGE entity style records its span (no graft, indent preserved)', () => {
		const src = `[PAGE title="P"]\n\t<b class="x">hi</b>\n\t<style>.x { color: red; }</style>\n[/PAGE]\n`;
		const [pg] = projectSdocBlocks(scanSdoc(src));
		const sourceLines = src.split('\n');
		const lines = pg.text.split('\n');
		const line = sourceLines.findIndex((l) => l.includes('<style>'));
		const col = sourceLines[line].indexOf('.x {');
		expect(lines[line].indexOf('.x {')).toBe(col);
		expect(pg.lineKinds[line]).toBe('recomposed');
		expect(pg.contentSpans?.[line]).toEqual({ start: col, end: col + '.x { color: red; }'.length });
		compileOk(pg.text);
	});
});

describe('projectSdoc: fence markers are not interchangeable (review regression)', () => {
	it('a ~~~ fence containing ``` and block-looking lines stays masked until ~~~', () => {
		const src =
			'[DOC title="G"]\nprose\n~~~\n```\n[example title="fake"]\n<NotReal {broken} />\n[/example]\n```\n~~~\ntail\n[/DOC]\n';
		const projection = projectSdoc(scanSdoc(src));
		const lines = projection.text.split('\n');
		const sourceLines = src.split('\n');
		// Prose outside the fence is live.
		expect(lines[1]).toBe('prose');
		expect(projection.lineKinds[1]).toBe('verbatim');
		// Everything from the ~~~ opener through the ~~~ closer is masked —
		// the inner ``` lines are fenced CONTENT, not a close/reopen.
		for (let l = 2; l <= 8; l++) {
			expect(lines[l]).toBe('');
			expect(projection.lineKinds[l]).toBe('masked');
		}
		// The fenced [example]/[/example] never became a snippet wrapper.
		expect(projection.text).not.toContain('__sdocs$0_0');
		// Prose after the real close is live again.
		const tail = sourceLines.findIndex((l) => l === 'tail');
		expect(lines[tail]).toBe('tail');
		expect(projection.lineKinds[tail]).toBe('verbatim');
		expect(() => compile(projection.text, { generate: false } as never)).not.toThrow();
	});

	it('a longer backtick fence is not closed by a shorter one', () => {
		const src = '[DOC title="G"]\n````\n```\n<NotReal {broken} />\n```\n````\ntail\n[/DOC]\n';
		const projection = projectSdoc(scanSdoc(src));
		const lines = projection.text.split('\n');
		for (let l = 1; l <= 5; l++) expect(lines[l]).toBe('');
		expect(lines[6]).toBe('tail');
		expect(projection.lineKinds[6]).toBe('verbatim');
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
