/**
 * TextMate grammar tests: tokenize real and synthetic .sdoc sources through
 * shiki under BOTH regex engines (Oniguruma, which VS Code uses, and the
 * JavaScript engine the Explorer client uses) and assert the sdoc scopes
 * survive multi-block files — the regression where the Svelte grammar's
 * catch-all text region swallowed everything after the first [preview].
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHighlighter, createHighlighterCore } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import js from '@shikijs/langs/javascript';
import ts from '@shikijs/langs/typescript';
import css from '@shikijs/langs/css';
import svelte from '@shikijs/langs/svelte';
import markdown from '@shikijs/langs/markdown';
import html from '@shikijs/langs/html';
import githubDark from '@shikijs/themes/github-dark';

const grammar = JSON.parse(
	readFileSync(resolve(__dirname, '../../src/lib/grammar/sdoc.tmLanguage.json'), 'utf8'),
);

const PLAIN = '#e1e4e8'; // github-dark default foreground

const MULTI_BLOCK = `<script lang="ts">
	import Tabs from './Tabs.svelte';
	import Tab from './Tab.svelte';
</script>

[SHOWCASE title="Nav / Tabs" description="A tab bar."]

	[preview component={Tabs} args={{ active: 0 }}]
		<Tabs {...args}>content ends in a tag</Tabs>
	[/preview]

	[preview component={Tab} title="Child"]
		<Tabs><Tab {...args} /></Tabs>
	[/preview]

	[example title="Frozen"]
		<Tabs vertical>x</Tabs>
	[/example]

[/SHOWCASE]

[PAGE title="Guide"]

	## Heading with {expression}

[/PAGE]

<style>
	.x { color: red; }
</style>
`;

type Tokens = { content: string; color?: string }[][];

function colorOf(tokens: Tokens, lines: string[], needle: string, from = 0): string {
	const idx = lines.findIndex((l, i) => i >= from && l.includes(needle));
	const word = needle.replace(/[^A-Za-z]/g, '');
	const tok = (tokens[idx] ?? []).find((t) => t.content.trim() === word || t.content.includes(word));
	return tok?.color?.toLowerCase() ?? 'MISSING';
}

function assertSdocScopes(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const firstDocs = lines.findIndex((l) => l.includes('[SHOWCASE'));
	const checks: [string, string][] = [
		['[SHOWCASE opener', colorOf(tokens, lines, '[SHOWCASE')],
		['[/preview] #1', colorOf(tokens, lines, '[/preview]')],
		['second [preview', colorOf(tokens, lines, '[preview', lines.findIndex((l) => l.includes('[/preview]')))],
		['[example opener', colorOf(tokens, lines, '[example')],
		['[/SHOWCASE] closer', colorOf(tokens, lines, '[/SHOWCASE]')],
		['[PAGE after SHOWCASE', colorOf(tokens, lines, '[PAGE', firstDocs + 1)],
		['markdown heading in PAGE body', colorOf(tokens, lines, '## Heading')],
		['[/PAGE] closer', colorOf(tokens, lines, '[/PAGE]')],
	];
	for (const [label, color] of checks) {
		expect(color, label).not.toBe('MISSING');
		expect(color, label).not.toBe(PLAIN);
	}
}

describe('sdoc grammar (Oniguruma engine, as in VS Code)', () => {
	it('keeps sdoc scopes alive across multiple blocks and entities', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const { tokens } = hl.codeToTokens(MULTI_BLOCK, { lang: 'sdoc', theme: 'github-dark' });
		assertSdocScopes(tokens as Tokens, MULTI_BLOCK);
		hl.dispose();
	});

	it('tokenizes the real corpus files without losing block scopes', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		for (const file of ['Notice.sdoc', 'NoticeJs.sdoc', 'Card.sdoc']) {
			const source = readFileSync(
				resolve(__dirname, '../../../../apps/docs/src/ui', file),
				'utf8',
			);
			const { tokens } = hl.codeToTokens(source, { lang: 'sdoc', theme: 'github-dark' });
			const lines = source.split('\n');
			expect(colorOf(tokens as Tokens, lines, '[/SHOWCASE]'), `${file} [/SHOWCASE]`).not.toBe(PLAIN);
			expect(colorOf(tokens as Tokens, lines, '[example'), `${file} [example`).not.toBe(PLAIN);
		}
		hl.dispose();
	});
});

describe('sdoc grammar (JavaScript engine, as in the Explorer client)', () => {
	it('keeps sdoc scopes alive across multiple blocks and entities', async () => {
		const hl = await createHighlighterCore({
			themes: [githubDark],
			langs: [js, ts, css, svelte, markdown, html, { ...grammar, name: 'sdoc' }],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		});
		const { tokens } = hl.codeToTokens(MULTI_BLOCK, { lang: 'sdoc', theme: 'github-dark' });
		assertSdocScopes(tokens as Tokens, MULTI_BLOCK);
		hl.dispose();
	});
});
