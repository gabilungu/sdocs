/**
 * Formatting for [PAGE] bodies that contain [example] blocks: the prose
 * around the blocks formats as markdown, the example bodies format as Svelte
 * fragments, the tags and the blank lines separating them stay put.
 */

import { describe, expect, it } from 'vitest';
import { formatSdoc } from '../src/server/formatting';

const OPTIONS = { tabSize: 4, insertSpaces: false };

describe('formatting PAGE bodies with examples', () => {
	it('formats example bodies as Svelte and prose as markdown', async () => {
		const source = [
			'[PAGE title="Colors"]',
			'',
			'\t#    Colors',
			'',
			'\tSome    prose *stays*.',
			'',
			'\t[example title="Ramp"]',
			'\t\t<div   class="row"  ><b>x</b></div>',
			'\t[/example]',
			'',
			'\tAfter.',
			'',
			'[/PAGE]',
			'',
		].join('\n');

		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		// markdown normalized the heading, svelte normalized the tag
		expect(result).toContain('\t# Colors');
		expect(result).toContain('\t\t<div class="row"><b>x</b></div>');
		// tags untouched, on their own lines
		expect(result).toContain('\t[example title="Ramp"]');
		expect(result).toContain('\t[/example]');
		// the blank lines around the example survive (prettier restyles emphasis)
		expect(result).toContain('_stays_.\n\n\t[example');
		expect(result).toContain('[/example]\n\n\tAfter.');
	});

	it('leaves an already-formatted page with examples unchanged', async () => {
		const source = [
			'[PAGE title="P"]',
			'',
			'\tProse.',
			'',
			'\t[example title="A"]',
			'\t\t<b>x</b>',
			'\t[/example]',
			'',
			'[/PAGE]',
			'',
		].join('\n');
		expect(await formatSdoc(source, OPTIONS)).toBeNull();
	});
});

describe('tag indentation normalization', () => {
	it('re-indents entity and sub-block tags to the structure', async () => {
		const source = [
			'  [PAGE title="P"]',
			'',
			'\t\t\tProse.',
			'',
			'\t\t\t[example title="A"]',
			'\t<b>x</b>',
			'\t\t\t\t\t[/example]',
			'',
			'\t\t[/PAGE]',
			'',
		].join('\n');
		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		const lines = result!.split('\n');
		expect(lines).toContain('[PAGE title="P"]');
		expect(lines).toContain('\tProse.');
		expect(lines).toContain('\t[example title="A"]');
		expect(lines).toContain('\t\t<b>x</b>');
		expect(lines).toContain('\t[/example]');
		expect(lines).toContain('[/PAGE]');
	});

	it('leaves an unclosed block\'s lines alone', async () => {
		// No [/PAGE]: the opener still normalizes, nothing else is guessed at.
		const source = ['\t[PAGE title="P"]', '', '\tProse.', ''].join('\n');
		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		expect(result!.split('\n')[0]).toBe('[PAGE title="P"]');
		expect(result).not.toContain('[/PAGE]');
	});
});

describe('fences survive formatting (mangling regression)', () => {
	it('never splits fences or joins tags on a rich page', async () => {
		const { readFileSync } = await import('node:fs');
		const { resolve } = await import('node:path');
		const source = readFileSync(resolve(__dirname, 'fixtures-markdown-page.sdoc'), 'utf8');

		const result = (await formatSdoc(source, OPTIONS)) ?? source;
		const lines = result.split('\n').map((l) => l.trim());

		// fences stay balanced and alone on their lines
		const fenceLines = lines.filter((l) => l.startsWith('```'));
		expect(fenceLines.length % 2).toBe(0);
		expect(fenceLines).toContain('```svelte');
		expect(fenceLines).toContain('```bash');
		// the fence interior stays inside: Button line still between the markers
		const svelteOpen = lines.indexOf('```svelte');
		const closeAfter = lines.indexOf('```', svelteOpen);
		const buttonLine = lines.findIndex((l) => l.startsWith('<Button label="Count:'));
		expect(buttonLine).toBeGreaterThan(svelteOpen);
		expect(buttonLine).toBeLessThan(closeAfter);
		// nothing ever joins block tags with other content
		expect(lines.some((l) => l.includes('[/example]') && l !== '[/example]')).toBe(false);
		expect(lines.some((l) => l.includes('[/PAGE]') && l !== '[/PAGE]')).toBe(false);
		// headings keep their own lines (the mangled output joined them)
		expect(lines).toContain('## Separators');
	});
});
