import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { scanSdoc } from '../../src/lib/language/scanner.js';
import { projectSdoc } from '../../src/lib/language/projection.js';

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
