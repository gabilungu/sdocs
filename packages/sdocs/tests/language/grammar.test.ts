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

[DOC title="Guide"]

	## Heading with {expression}

[/DOC]

<style>
	.x { color: red; }
</style>
`;

// A file the formatter has wrapped: openers wider than printWidth become one
// attribute per line with the closing ] on its own line. The block-opener case
// includes an {{…}} expression value, whose begin/end expression region used to
// leak past its line and desync the Svelte body — the ] below turned into
// text.svelte and everything after it lost its scopes.
const WRAPPED = `<script lang="ts">
	import Root from './Root.svelte';
</script>

[SHOWCASE
	title="Wrapped / Opener"
	description="Long enough that the opener wraps onto several lines in the formatter."
]

	[preview
		component={Root}
		args={{ active: 0 }}
	]
		<Root {...args}>body</Root>
	[/preview]

[/SHOWCASE]
`;

type Tokens = { content: string; color?: string; explanation?: { scopes: { scopeName: string }[] }[] }[][];

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
		['[DOC after SHOWCASE', colorOf(tokens, lines, '[DOC', firstDocs + 1)],
		['markdown heading in PAGE body', colorOf(tokens, lines, '## Heading')],
		['[/DOC] closer', colorOf(tokens, lines, '[/DOC]')],
	];
	for (const [label, color] of checks) {
		expect(color, label).not.toBe('MISSING');
		expect(color, label).not.toBe(PLAIN);
	}
}

function assertWrappedOpener(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (needle: string) => lines.findIndex((l) => l.includes(needle));
	const scopeOf = (lineIdx: number, word: string) => {
		const tok = (tokens[lineIdx] ?? []).find((t) => t.content.trim() === word);
		const sc = tok?.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? [];
		return sc[sc.length - 1] ?? 'MISSING';
	};
	// Wrapped entity-opener attribute names are scoped, not swallowed as plain text.
	expect(scopeOf(li('\ttitle='), 'title'), 'wrapped title=').toContain('attribute-name.sdoc');
	expect(scopeOf(li('\tdescription='), 'description'), 'wrapped description=').toContain('attribute-name.sdoc');
	// Wrapped block-opener attribute names, including one with an {{…}} value.
	expect(scopeOf(li('\t\tcomponent='), 'component'), 'wrapped component=').toContain('attribute-name.sdoc');
	expect(scopeOf(li('\t\targs='), 'args'), 'wrapped args=').toContain('attribute-name.sdoc');
	// The standalone ] that closes the wrapped [preview opener is the tag end —
	// the regression turned this into text.svelte and desynced the body below.
	expect(scopeOf(li('\t]'), ']'), 'standalone ] of wrapped preview').toContain('tag.end.sdoc');
	// Body after the wrapped opener still highlights as Svelte, and the closers survive.
	expect(scopeOf(li('<Root {...args}'), 'Root'), 'body component after wrapped opener').toContain('svelte');
	expect(scopeOf(li('[/preview]'), 'preview'), '[/preview] after wrapped opener').toContain('.sdoc');
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

	it('colors wrapped multi-line openers without desyncing the body', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const { tokens } = hl.codeToTokens(WRAPPED, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertWrappedOpener(tokens as Tokens, WRAPPED);
		hl.dispose();
	});

	it('colors block-level script/style inside example bodies', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const { tokens } = hl.codeToTokens(BLOCK_TAGS, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertBlockTags(tokens as Tokens, BLOCK_TAGS);
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

	it('colors wrapped multi-line openers without desyncing the body', async () => {
		const hl = await createHighlighterCore({
			themes: [githubDark],
			langs: [js, ts, css, svelte, markdown, html, { ...grammar, name: 'sdoc' }],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		});
		const { tokens } = hl.codeToTokens(WRAPPED, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertWrappedOpener(tokens as Tokens, WRAPPED);
		hl.dispose();
	});

	it('colors block-level script/style inside example bodies', async () => {
		const hl = await createHighlighterCore({
			themes: [githubDark],
			langs: [js, ts, css, svelte, markdown, html, { ...grammar, name: 'sdoc' }],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		});
		const { tokens } = hl.codeToTokens(BLOCK_TAGS, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertBlockTags(tokens as Tokens, BLOCK_TAGS);
		hl.dispose();
	});
});

// A block-level <script>/<style> inside an [example] — the wrapped-opener of
// the feature: sdoc tag scopes on the tags, embedded TS/CSS in the bodies,
// and no desync into the markup between or the sibling example after.
const BLOCK_TAGS = `[SHOWCASE title="Nav"]
	[example title="Data"]
		<script lang="ts">
			const items = [{ label: "Home" }];
		</script>
		<Nav {items} />
		<span class="hint">pick</span>
		<style>
			.hint { color: gray; }
		</style>
	[/example]
	[example title="After"]
		<Nav plain />
	[/example]
[/SHOWCASE]
`;

function assertBlockTags(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (needle: string, from = 0) => lines.findIndex((l, i) => i >= from && l.includes(needle));
	const scopeOf = (lineIdx: number, word: string) => {
		const tok = (tokens[lineIdx] ?? []).find((t) => t.content.trim() === word || t.content.includes(word));
		const sc = tok?.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? [];
		return sc[sc.length - 1] ?? 'MISSING';
	};
	expect(scopeOf(li('<script lang="ts">'), 'script'), 'block script tag').toContain('.sdoc');
	expect(scopeOf(li('const items'), 'const'), 'TS inside block script').toContain('.ts');
	expect(scopeOf(li('<Nav {items}'), 'Nav'), 'markup after block script').toContain('svelte');
	expect(scopeOf(li('.hint { color'), 'color'), 'CSS inside block style').toContain('.css');
	expect(scopeOf(li('[/example]'), 'example'), 'closer after block style').toContain('.sdoc');
	expect(scopeOf(li('<Nav plain'), 'Nav'), 'sibling example unaffected').toContain('svelte');
}
