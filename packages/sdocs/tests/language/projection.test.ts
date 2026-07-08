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
