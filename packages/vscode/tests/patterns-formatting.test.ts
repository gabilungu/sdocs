/**
 * Formatting for [PATTERNS] bodies: a [PATTERNS] holds blocks the way a
 * [SHOWCASE] does, so each [EXAMPLE] body formats as its own Svelte fragment
 * and each [PROSE] as markdown. Formatted as one fragment instead, the block
 * tags make the whole body unparseable and nothing in it formats at all.
 */

import { describe, expect, it } from 'vitest';
import { formatSdoc } from '../src/server/formatting';

const OPTIONS = { tabSize: 4, insertSpaces: false };

describe('formatting PATTERNS bodies', () => {
	it('formats example bodies as Svelte and prose as markdown', async () => {
		const source = [
			'[PATTERNS title="Patterns / User Menu"]',
			'',
			'\t[PROSE]',
			'\t\tSome    prose *here*.',
			'\t[/PROSE]',
			'',
			'\t[EXAMPLE title="Signed out"]',
			'\t\t<Menu   >Sign in</Menu>',
			'\t[/EXAMPLE]',
			'',
			'\t[NOTES]',
			'\t\t- tip:   left exactly as written',
			'\t[/NOTES]',
			'',
			'[/PATTERNS]',
			'',
		].join('\n');

		const result = await formatSdoc(source, OPTIONS);
		expect(result).not.toBeNull();
		expect(result).toContain('\t\t<Menu>Sign in</Menu>');
		expect(result).toContain('\t\tSome prose _here_.');
		// line-grammar bodies keep their authored shape, as in a [SHOWCASE]
		expect(result).toContain('\t\t- tip:   left exactly as written');
		expect(result).toContain('\t[EXAMPLE title="Signed out"]');
		expect(result).toContain('\n[/PATTERNS]');
	});

	it('formats a PATTERNS body the same as the SHOWCASE body it mirrors', async () => {
		const body = [
			'',
			'\t[example title="A"]',
			'\t\t<Menu   ><b>x</b></Menu>',
			'\t[/example]',
			'',
		];
		const as = (kind: string) =>
			[`[${kind} title="T"]`, ...body, `[/${kind}]`, ''].join('\n');

		const patterns = await formatSdoc(as('PATTERNS'), OPTIONS);
		const showcase = await formatSdoc(as('SHOWCASE'), OPTIONS);
		expect(patterns).toBe(showcase!.replace(/SHOWCASE/g, 'PATTERNS'));
	});

	it('leaves an already-formatted pattern unchanged', async () => {
		const source = [
			'[PATTERNS title="P"]',
			'',
			'\t[EXAMPLE title="A"]',
			'\t\t<b>x</b>',
			'\t[/EXAMPLE]',
			'',
			'[/PATTERNS]',
			'',
		].join('\n');
		expect(await formatSdoc(source, OPTIONS)).toBeNull();
	});
});
