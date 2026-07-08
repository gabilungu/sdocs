/**
 * Formatting for [DOC] bodies that contain [example] blocks: the prose
 * around the blocks formats as markdown, the example bodies format as Svelte
 * fragments, the tags and the blank lines separating them stay put.
 */

import { describe, expect, it } from 'vitest';
import { formatSdoc } from '../src/server/formatting';

const OPTIONS = { tabSize: 4, insertSpaces: false };

describe('formatting PAGE bodies with examples', () => {
	it('formats example bodies as Svelte and prose as markdown', async () => {
		const source = [
			'[DOC title="Colors"]',
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
			'[/DOC]',
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
			'[DOC title="P"]',
			'',
			'\tProse.',
			'',
			'\t[example title="A"]',
			'\t\t<b>x</b>',
			'\t[/example]',
			'',
			'[/DOC]',
			'',
		].join('\n');
		expect(await formatSdoc(source, OPTIONS)).toBeNull();
	});
});

describe('tag indentation normalization', () => {
	it('re-indents entity and sub-block tags to the structure', async () => {
		const source = [
			'  [DOC title="P"]',
			'',
			'\t\t\tProse.',
			'',
			'\t\t\t[example title="A"]',
			'\t<b>x</b>',
			'\t\t\t\t\t[/example]',
			'',
			'\t\t[/DOC]',
			'',
		].join('\n');
		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		const lines = result!.split('\n');
		expect(lines).toContain('[DOC title="P"]');
		expect(lines).toContain('\tProse.');
		expect(lines).toContain('\t[example title="A"]');
		expect(lines).toContain('\t\t<b>x</b>');
		expect(lines).toContain('\t[/example]');
		expect(lines).toContain('[/DOC]');
	});

	it('leaves an unclosed block\'s lines alone', async () => {
		// No [/DOC]: the opener still normalizes, nothing else is guessed at.
		const source = ['\t[DOC title="P"]', '', '\tProse.', ''].join('\n');
		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		expect(result!.split('\n')[0]).toBe('[DOC title="P"]');
		expect(result).not.toContain('[/DOC]');
	});
});

describe('scan-error lines stay byte-identical (no authored text deleted)', () => {
	it('keeps a duplicate attribute instead of dropping it', async () => {
		// The scanner keeps only the first duplicate; rebuilding the opener
		// from parsed attrs used to format away title="b" entirely.
		const source = [
			'[SHOWCASE title="X"]',
			'',
			'\t[example title="a" title="b"]',
			'\t\t<b   >x</b>',
			'\t[/example]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		// the erroneous opener line is untouched, duplicate and all
		expect(result!.split('\n')[2]).toBe('\t[example title="a" title="b"]');
		// the rest of the file still formats
		expect(result).toContain('\t\t<b>x</b>');
	});

	it('keeps stray text after the opener bracket', async () => {
		const source = [
			'[SHOWCASE title="X"]',
			'',
			'\t[example title="a"] stray text',
			'\t\t<b   >x</b>',
			'\t[/example]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		expect(result!.split('\n')[2]).toBe('\t[example title="a"] stray text');
		expect(result).toContain('\t\t<b>x</b>');
	});
});

describe('line endings', () => {
	const lfSource = [
		'[SHOWCASE title="X"]',
		'',
		'\t[example title="A"]',
		'\t\t<b   >x</b>',
		'\t[/example]',
		'',
		'[/SHOWCASE]',
		'',
	].join('\n');

	it('formats a CRLF document to 100% CRLF', async () => {
		const crlfSource = lfSource.replace(/\n/g, '\r\n');
		const result = await formatSdoc(crlfSource, OPTIONS);
		expect(result).not.toBeNull();
		// every newline is CRLF — no LF-only lines, no stray CR elsewhere
		expect(result!.replace(/\r\n/g, '')).not.toContain('\r');
		expect(result!.replace(/\r\n/g, '')).not.toContain('\n');
		// same content as the LF-space formatting
		const lfResult = await formatSdoc(lfSource, OPTIONS);
		expect(result!.replace(/\r\n/g, '\n')).toBe(lfResult);
	});

	it('keeps an LF document 100% LF', async () => {
		const result = await formatSdoc(lfSource, OPTIONS);
		expect(result).not.toBeNull();
		expect(result).not.toContain('\r');
	});
});

describe('opener wrapping at printWidth (default 80)', () => {
	const desc = 'x'.repeat(120);

	it('wraps a too-wide entity opener to one attribute per line, verbatim', async () => {
		const source = [
			`[SHOWCASE title="@demo/Widget" description="${desc}"]`,
			'',
			'\t[preview component={Widget}]',
			'\t\t<Widget />',
			'\t[/preview]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = await formatSdoc(source, OPTIONS);
		expect(out).not.toBeNull();
		// tag alone, each attribute on its own indented line, ] back at column 0
		expect(out).toContain(
			['[SHOWCASE', '\ttitle="@demo/Widget"', `\tdescription="${desc}"`, ']'].join('\n'),
		);
		// the short sub-block opener stays on one line
		expect(out).toContain('\t[preview component={Widget}]');
	});

	it('wraps a wide sub-block opener at its own indent', async () => {
		const args = `args={{ label: "a", value: "${'b'.repeat(60)}" }}`;
		const source = [
			'[SHOWCASE title="D"]',
			'',
			`\t[preview component={Widget} ${args}]`,
			'\t\t<Widget />',
			'\t[/preview]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = await formatSdoc(source, OPTIONS);
		expect(out).not.toBeNull();
		expect(out).toContain(['\t[preview', '\t\tcomponent={Widget}', `\t\t${args}`, '\t]'].join('\n'));
		// the short entity opener above it is untouched
		expect(out).toContain('[SHOWCASE title="D"]');
	});

	it('is idempotent — an already-wrapped opener re-formats to itself', async () => {
		const wrapped = [
			'[SHOWCASE',
			'\ttitle="@demo/Widget"',
			`\tdescription="${desc}"`,
			']',
			'',
			'\t[preview component={Widget}]',
			'\t\t<Widget />',
			'\t[/preview]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = (await formatSdoc(wrapped, OPTIONS)) ?? wrapped;
		expect(out).toContain(
			['[SHOWCASE', '\ttitle="@demo/Widget"', `\tdescription="${desc}"`, ']'].join('\n'),
		);
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
		expect(lines.some((l) => l.includes('[/DOC]') && l !== '[/DOC]')).toBe(false);
		// headings keep their own lines (the mangled output joined them)
		expect(lines).toContain('## Separators');
	});
});

describe('block-level <script>/<style> formatting', () => {
	it('formats a body containing its own script and style as a mini component', async () => {
		const source = `[SHOWCASE title="Nav"]

	[example title="Data"]
		<script lang="ts">
			const   items=[{label:"Home"}]
			let active   =  $state("Home")
		</script>
		<p   class="hint"  >{active}</p>
		<style>
			.hint{color:gray}
		</style>
	[/example]

[/SHOWCASE]
`;
		const formatted = await formatSdoc(source, { tabSize: 2, insertSpaces: false });
		expect(formatted).not.toBeNull();
		// script formatted, first in the body
		expect(formatted!).toContain('const items = [{ label: "Home" }];');
		// markup formatted
		expect(formatted!).toContain('<p class="hint">{active}</p>');
		// style formatted, last in the body
		expect(formatted!).toMatch(/\.hint\s*{\s*\n\s*color:\s*gray;/);
		// structure intact
		expect(formatted!).toContain('[/example]');
	});
});

describe('whitespace sensitivity default', () => {
	const HUGGY = `[SHOWCASE title="X"]

	[example title="Long opener with text"]
		<NoticeJs {...args} title="Update available" action={{ label: "Restart now" }}>The action prop is a custom JSDoc typedef — it appears by name in the Props table.</NoticeJs>
	[/example]

[/SHOWCASE]
`;

	it('ships htmlWhitespaceSensitivity: ignore — no bracket hugging by default', async () => {
		const formatted = await formatSdoc(HUGGY, OPTIONS);
		expect(formatted).not.toBeNull();
		// the hugged forms: a line starting with ">" or a split "</Tag\n>"
		expect(formatted!).not.toMatch(/\n\s*>/);
		expect(formatted!).not.toMatch(/<\/NoticeJs\n/);
	});

	it('an explicit .prettierrc htmlWhitespaceSensitivity still wins', async () => {
		const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-fmt-'));
		try {
			writeFileSync(join(dir, '.prettierrc'), '{ "htmlWhitespaceSensitivity": "css" }');
			const formatted = await formatSdoc(HUGGY, OPTIONS, undefined, join(dir, 'X.sdoc'));
			expect(formatted).not.toBeNull();
			// strict mode: prettier hugs the bracket to protect whitespace
			expect(formatted!).toMatch(/\n\s*>/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('entity-level script/style formatting', () => {
	it('a format round-trip preserves entity scripts and styles intact', async () => {
		// The example closer is misindented so the formatter produces an edit.
		const source = `[SHOWCASE title="X"]

	<script lang="ts">
		const shared = [1, 2];
	</script>

	[example title="A"]
		<b>{shared}</b>
			[/example]

	<style>
		.n { color: gray; }
	</style>

[/SHOWCASE]
`;
		const formatted = await formatSdoc(source, OPTIONS);
		expect(formatted).not.toBeNull();
		expect(formatted!).toContain('const shared = [1, 2];');
		expect(formatted!).toContain('.n { color: gray; }');
		expect(formatted!).toContain('\n\t[/example]');
	});
});
