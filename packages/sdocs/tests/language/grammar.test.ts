/**
 * TextMate grammar tests: tokenize real and synthetic .sdoc sources through
 * shiki under BOTH regex engines (Oniguruma, which VS Code uses, and the
 * JavaScript engine the Explorer client uses) and assert the sdoc scopes
 * survive multi-block files — the regression where the Svelte grammar's
 * catch-all text region swallowed everything after the first [component].
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHighlighter, createHighlighterCore } from 'shiki';
import { NOTE_TYPES } from '../../src/lib/note-order.js';
import { scanSdoc } from '../../src/lib/language/scanner.js';
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

	[component component={Tabs} args={{ active: 0 }}]
		<Tabs {...args}>content ends in a tag</Tabs>
	[/component]

	[component component={Tab} title="Child"]
		<Tabs><Tab {...args} /></Tabs>
	[/component]

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

	[component
		component={Root}
		args={{ active: 0 }}
	]
		<Root {...args}>body</Root>
	[/component]

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
		['[/component] #1', colorOf(tokens, lines, '[/component]')],
		['second [component', colorOf(tokens, lines, '[component', lines.findIndex((l) => l.includes('[/component]')))],
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
	// The standalone ] that closes the wrapped [component opener is the tag end —
	// the regression turned this into text.svelte and desynced the body below.
	expect(scopeOf(li('\t]'), ']'), 'standalone ] of wrapped preview').toContain('tag.end.sdoc');
	// Body after the wrapped opener still highlights as Svelte, and the closers survive.
	expect(scopeOf(li('<Root {...args}'), 'Root'), 'body component after wrapped opener').toContain('svelte');
	expect(scopeOf(li('[/component]'), 'component'), '[/component] after wrapped opener').toContain('.sdoc');
}

const UPPERCASE_BLOCKS = MULTI_BLOCK.replace(/\[(\/?)(component|example)\b/g, (_, close, tag) =>
	`[${close}${tag.toUpperCase()}`,
).replace(/\[\/(COMPONENT|EXAMPLE)\]/g, '[/$1]');

const TEXT_BLOCKS = `[SHOWCASE title="Forms / Button"]

	[NOTES]
		- bug: Focus ring lands 1px off.
		- Just a remark.
	[/NOTES]

	[TODO]
		- [x] Ship it
		- [ ] Document it
	[/TODO]

	[PROSE]
		A **button** triggers an action.
	[/PROSE]

	[COMPONENTS]
		[COMPONENT component={Button}]
			<Button />
		[/COMPONENT]
	[/COMPONENTS]

	[GLOSSARY title="Terms" search]
		- Stage: the isolated frame a preview renders in.
	[/GLOSSARY]

[/SHOWCASE]

[DOC title="Guide"]

	See [notes](/language/overview#notes) for the details.

[/DOC]
`;

describe('sdoc grammar (Oniguruma engine, as in VS Code)', () => {
	// The blocks added in 0.0.139, and the collision that shaped them: a line
	// starting `[notes](…)` is a markdown link, not a block opener, so the tags
	// are matched uppercase and alone on their line.
	it('scopes the text blocks without eating a markdown link', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const { tokens } = hl.codeToTokens(TEXT_BLOCKS, {
			lang: 'sdoc',
			theme: 'github-dark',
			// The link assertion below reads scopes, and shiki only attaches them
			// when asked — without this it compared an empty list and always passed.
			includeExplanation: true,
		});
		const lines = TEXT_BLOCKS.split('\n');
		for (const tag of ['[NOTES]', '[TODO]', '[PROSE]', '[COMPONENTS]', '[/COMPONENTS]', '[/GLOSSARY]']) {
			const color = colorOf(tokens as Tokens, lines, tag);
			expect(color, tag).not.toBe('MISSING');
			expect(color, tag).not.toBe(PLAIN);
		}
		// The link is prose: its scope is markdown's, never an sdoc tag's.
		const li = lines.findIndex((l) => l.includes('[notes]('));
		const scopes = (tokens[li] ?? []).flatMap(
			(t) => t.explanation?.flatMap((e) => e.scopes.map((sc) => sc.scopeName)) ?? [],
		);
		expect(scopes.some((sc) => sc.includes('keyword.control.block.sdoc'))).toBe(false);
		hl.dispose();
	});

	// Both casings scope identically: the formatter rewrites files to uppercase,
	// and lowercase stays legal indefinitely, so neither may lose highlighting.
	it('scopes uppercase [COMPONENT] and [EXAMPLE] exactly like lowercase', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const upper = hl.codeToTokens(UPPERCASE_BLOCKS, { lang: 'sdoc', theme: 'github-dark' });
		const lower = hl.codeToTokens(MULTI_BLOCK, { lang: 'sdoc', theme: 'github-dark' });
		const colors = (t: Tokens) => t.map((line) => line.map((tok) => tok.color?.toLowerCase()));
		expect(colors(upper.tokens as Tokens)).toEqual(colors(lower.tokens as Tokens));
		hl.dispose();
	});

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

// CSS-custom-property props (--x="…" / --x={…}) color like sibling attributes
// via a root-grammar injection; values keep their own scopes.
describe('css-custom-property prop parity', () => {
	it('scopes --foo= as an attribute name with intact values (both value forms)', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const src = '[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<Box text="hi" --background="red" --size={16} />\n\t[/example]\n[/SHOWCASE]\n';
		const { tokens } = hl.codeToTokens(src, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		const scopeOf = (word: string) => {
			const tok = tokens[2].find((t) => t.content.trim() === word);
			const sc = tok?.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? [];
			return sc[sc.length - 1] ?? 'MISSING';
		};
		expect(scopeOf('--background')).toContain('attribute-name');
		expect(scopeOf('--size')).toContain('attribute-name');
		expect(scopeOf('"red"')).toContain('string');
		expect(scopeOf('16')).toContain('.ts');
		hl.dispose();
	});
});

describe('entity-level script/style coloring', () => {
	it('colors entity scripts and styles in SHOWCASE and PAGE bodies', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const src = '[SHOWCASE title="X"]\n\t<script lang="ts">\n\t\tconst shared = [1];\n\t</script>\n\t[example title="A"]\n\t\t<b>{shared}</b>\n\t[/example]\n\t<style>\n\t\t.n { color: gray; }\n\t</style>\n[/SHOWCASE]\n';
		const { tokens } = hl.codeToTokens(src, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		const scopeAt = (li: number, word: string) => {
			const t = tokens[li].find((t) => t.content.trim() === word);
			const s = t?.explanation?.flatMap((e) => e.scopes.map((x) => x.scopeName)) ?? [];
			return s[s.length - 1] ?? 'MISSING';
		};
		expect(scopeAt(2, 'const')).toContain('.ts');
		expect(scopeAt(8, 'color')).toContain('.css');
		expect(scopeAt(10, 'SHOWCASE')).toContain('.sdoc');
		hl.dispose();
	});
});

describe('DOC entity script/style coloring (review regression)', () => {
	it('colors entity scripts and styles inside DOC bodies', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const src = '[DOC title="G"]\n\t<script lang="ts">\n\t\tconst n = 1;\n\t</script>\n\n\tprose\n\n\t<style>\n\t\t.x { color: gray; }\n\t</style>\n[/DOC]\n';
		const { tokens } = hl.codeToTokens(src, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		const scopeAt = (li: number, word: string) => {
			const t = tokens[li].find((t) => t.content.trim() === word);
			const sc = t?.explanation?.flatMap((e) => e.scopes.map((x) => x.scopeName)) ?? [];
			return sc[sc.length - 1] ?? 'MISSING';
		};
		expect(scopeAt(2, 'const')).toContain('.ts');
		expect(scopeAt(8, 'color')).toContain('.css');
		hl.dispose();
	});
});

// ---------------------------------------------------------------------------
// Shared helpers for the boundary/fence regressions below: full scope chains
// (joined) so tests can assert on any scope in the stack, not just the last.

function lineIndex(lines: string[], needle: string, from = 0): number {
	return lines.findIndex((l, i) => i >= from && l.includes(needle));
}

function chainAt(tokens: Tokens, lineIdx: number, word: string): string {
	const row = tokens[lineIdx] ?? [];
	const tok = row.find((t) => t.content.trim() === word) ?? row.find((t) => t.content.includes(word));
	return (tok?.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? []).join(' ');
}

function lineScopes(tokens: Tokens, lineIdx: number): string {
	return (tokens[lineIdx] ?? [])
		.flatMap((t) => t.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? [])
		.join(' ');
}

async function oniHighlighter() {
	return createHighlighter({
		themes: ['github-dark'],
		langs: [
			'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
			{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
		],
	});
}

async function jsHighlighter() {
	return createHighlighterCore({
		themes: [githubDark],
		langs: [js, ts, css, svelte, markdown, html, { ...grammar, name: 'sdoc' }],
		engine: createJavaScriptRegexEngine({ forgiving: true }),
	});
}

// <style/<script begins used to match any tag that merely starts with the
// word: <styled-button> opened a CSS region that swallowed the rest of the
// block. The begins now require a real tag-name boundary (whitespace, /, >).
const CUSTOM_TAGS = `[SHOWCASE title="Widgets"]
	[example title="A"]
		<styled-button label="go">press</styled-button>
		<script-demo speed={1} />
		<span class="after">still svelte</span>
		<style >
			.a { color: red; }
		</style>
		<style>.b { color: blue; }</style>
	[/example]
[/SHOWCASE]
`;

const TOP_LEVEL_CUSTOM = `<script lang="ts">
	const top: number = 1;
</script>

<styled-button>press</styled-button>

[SHOWCASE title="Widgets"]
	[example title="A"]
		<b>hi</b>
	[/example]
[/SHOWCASE]

<style>
	.top { color: red; }
</style>
`;

function assertCustomTagBoundaries(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (n: string, from = 0) => lineIndex(lines, n, from);
	// Custom elements whose names start with style/script are plain markup.
	const styled = chainAt(tokens, li('<styled-button'), 'styled-button');
	expect(styled, '<styled-button> tag name').toContain('svelte');
	expect(styled, '<styled-button> tag name').not.toContain('entity.name.tag.style.sdoc');
	expect(styled, '<styled-button> tag name').not.toContain('source.css');
	const demo = chainAt(tokens, li('<script-demo'), 'script-demo');
	expect(demo, '<script-demo> tag name').toContain('svelte');
	expect(demo, '<script-demo> tag name').not.toContain('entity.name.tag.script.sdoc');
	// Markup after them is untouched — nothing was swallowed as CSS/JS.
	expect(chainAt(tokens, li('class="after"'), 'span'), 'markup after custom tags').toContain('svelte');
	// Real style tags still open CSS: attribute-position whitespace and single-line.
	expect(chainAt(tokens, li('.a { color: red'), 'color'), 'CSS inside <style >').toContain('css');
	expect(chainAt(tokens, li('<style>.b'), 'blue'), 'CSS inside single-line <style>x</style>').toContain('css');
	// Region bookkeeping survives to the closers.
	expect(chainAt(tokens, li('[/example]'), 'example'), '[/example] closer').toContain('.sdoc');
	expect(chainAt(tokens, li('[/SHOWCASE]'), 'SHOWCASE'), '[/SHOWCASE] closer').toContain('.sdoc');
}

function assertTopLevelCustomTag(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (n: string, from = 0) => lineIndex(lines, n, from);
	// Real file-level <script lang="ts"> still embeds TS.
	expect(chainAt(tokens, li('const top'), 'const'), 'file-level script').toContain('.ts');
	// The custom element does not open a file-level CSS region…
	const styledLine = lineScopes(tokens, li('<styled-button'));
	expect(styledLine, '<styled-button> at file level').not.toContain('entity.name.tag.style.sdoc');
	expect(styledLine, '<styled-button> at file level').not.toContain('source.css');
	// …so the entity after it still tokenizes as sdoc, and file-level <style> still works.
	expect(chainAt(tokens, li('[SHOWCASE'), 'SHOWCASE'), '[SHOWCASE after custom tag').toContain('keyword.control.entity.sdoc');
	expect(chainAt(tokens, li('.top { color'), 'color'), 'file-level style').toContain('css');
}

describe('script/style begins require a tag-name boundary (review regression)', () => {
	it('Oniguruma: <styled-button>/<script-demo> stay plain markup, real tags still color', async () => {
		const hl = await oniHighlighter();
		const blocks = hl.codeToTokens(CUSTOM_TAGS, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertCustomTagBoundaries(blocks.tokens as Tokens, CUSTOM_TAGS);
		const top = hl.codeToTokens(TOP_LEVEL_CUSTOM, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertTopLevelCustomTag(top.tokens as Tokens, TOP_LEVEL_CUSTOM);
		hl.dispose();
	});

	it('JavaScript engine: <styled-button>/<script-demo> stay plain markup, real tags still color', async () => {
		const hl = await jsHighlighter();
		const blocks = hl.codeToTokens(CUSTOM_TAGS, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertCustomTagBoundaries(blocks.tokens as Tokens, CUSTOM_TAGS);
		const top = hl.codeToTokens(TOP_LEVEL_CUSTOM, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true });
		assertTopLevelCustomTag(top.tokens as Tokens, TOP_LEVEL_CUSTOM);
		hl.dispose();
	});
});

// A [/DOC] line inside a markdown fence used to pop the DOC region (the
// markdown while-loop re-checks its condition on every line, so no child
// region could shield it). Fences are now direct begin/end children of the
// DOC region: the closer inside stays fence content, prose after the fence
// keeps its markdown scopes, and the real closer still ends the region.
const DOC_FENCE = `[DOC title="Guide"]

	Intro prose.

	\`\`\`
	[/DOC]
	still fenced
	\`\`\`

	## After the fence

[/DOC]

[SHOWCASE title="Later"]
[/SHOWCASE]
`;

const DOC_TILDE = `[DOC title="Guide"]

	~~~
	\`\`\`
	[/DOC]
	\`\`\`
	~~~

	## Tail heading

[/DOC]
`;

const DOC_JS_FENCE = `[DOC title="Guide"]

	\`\`\`js
	const fenced = 1;
	[/DOC]
	\`\`\`

	tail prose

[/DOC]
`;

const DOC_EXAMPLE_FENCE = `[DOC title="Guide"]

	\`\`\`
	[/example]
	\`\`\`

	[example title="Demo"]
		<b>bold</b>
		\`\`\`
		[/example]

	## After example

[/DOC]
`;

function assertDocFence(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (n: string, from = 0) => lineIndex(lines, n, from);
	const fencedCloser = li('[/DOC]');
	expect(lineScopes(tokens, fencedCloser), '[/DOC] inside fence').toContain('fenced_code');
	expect(lineScopes(tokens, fencedCloser), '[/DOC] inside fence').not.toContain('keyword.control.entity');
	expect(chainAt(tokens, li('## After the fence'), 'After'), 'prose after the fence').toContain('heading');
	expect(chainAt(tokens, li('[/DOC]', fencedCloser + 1), 'DOC'), 'real [/DOC] closer').toContain('keyword.control.entity.sdoc');
	expect(chainAt(tokens, li('[SHOWCASE'), 'SHOWCASE'), 'entity after the DOC').toContain('keyword.control.entity.sdoc');
}

function assertDocTildeFence(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (n: string, from = 0) => lineIndex(lines, n, from);
	const opener = li('~~~');
	const firstTicks = li('```', opener);
	const fencedCloser = li('[/DOC]');
	// ``` lines inside a ~~~ fence are fence content, not nested fences.
	expect(lineScopes(tokens, firstTicks), '``` inside ~~~ fence').toContain('fenced_code');
	expect(lineScopes(tokens, li('```', firstTicks + 1)), 'second ``` inside ~~~ fence').toContain('fenced_code');
	expect(lineScopes(tokens, fencedCloser), '[/DOC] inside ~~~ fence').not.toContain('keyword.control.entity');
	expect(chainAt(tokens, li('## Tail heading'), 'Tail'), 'prose after ~~~ fence').toContain('heading');
	expect(chainAt(tokens, li('[/DOC]', fencedCloser + 1), 'DOC'), 'real [/DOC] closer').toContain('keyword.control.entity.sdoc');
}

function assertDocJsFence(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (n: string, from = 0) => lineIndex(lines, n, from);
	const fencedCloser = li('[/DOC]');
	// Language fences keep their embedded highlighting.
	expect(lineScopes(tokens, li('const fenced')), 'js fence embeds javascript').toContain('meta.embedded.block.javascript');
	expect(chainAt(tokens, li('const fenced'), 'const'), 'js inside ```js fence').toContain('.js');
	expect(lineScopes(tokens, fencedCloser), '[/DOC] inside ```js fence').toContain('fenced_code');
	expect(lineScopes(tokens, fencedCloser), '[/DOC] inside ```js fence').not.toContain('keyword.control.entity');
	expect(lineScopes(tokens, li('tail prose')), 'prose after ```js fence').toContain('meta.embedded.block.markdown');
	expect(chainAt(tokens, li('[/DOC]', fencedCloser + 1), 'DOC'), 'real [/DOC] closer').toContain('keyword.control.entity.sdoc');
}

function assertDocExampleFence(tokens: Tokens, source: string) {
	const lines = source.split('\n');
	const li = (n: string, from = 0) => lineIndex(lines, n, from);
	// [/example] inside a DOC prose fence is fence content, not a closer.
	const fencedCloser = li('[/example]');
	expect(lineScopes(tokens, fencedCloser), '[/example] inside DOC fence').toContain('fenced_code');
	expect(lineScopes(tokens, fencedCloser), '[/example] inside DOC fence').not.toContain('meta.block.example.sdoc');
	// Inside [example] markup a ``` line is plain Svelte text — no fence grows…
	const opener = li('[example title="Demo"');
	expect(chainAt(tokens, opener, 'example'), '[example opener').toContain('entity.name.tag.sdoc');
	expect(chainAt(tokens, li('<b>bold'), 'b'), 'example body').toContain('svelte');
	const ticksInExample = li('```', opener);
	expect(lineScopes(tokens, ticksInExample), '``` inside example markup').toContain('meta.block.example.sdoc');
	expect(lineScopes(tokens, ticksInExample), '``` inside example markup').not.toContain('fenced_code');
	// …so the [/example] after it still closes the example.
	expect(chainAt(tokens, li('[/example]', opener), 'example'), '[/example] in example markup').toContain('entity.name.tag.sdoc');
	expect(chainAt(tokens, li('## After example'), 'After'), 'prose after the example').toContain('heading');
	expect(chainAt(tokens, li('[/DOC]', fencedCloser + 1), 'DOC'), 'real [/DOC] closer').toContain('keyword.control.entity.sdoc');
}

describe('markdown fences shield entity closers in DOC bodies (review regression)', () => {
	it('Oniguruma: fenced [/DOC]/[/example] stay fenced, real closers still close', async () => {
		const hl = await oniHighlighter();
		const run = (src: string) => hl.codeToTokens(src, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true }).tokens as Tokens;
		assertDocFence(run(DOC_FENCE), DOC_FENCE);
		assertDocTildeFence(run(DOC_TILDE), DOC_TILDE);
		assertDocJsFence(run(DOC_JS_FENCE), DOC_JS_FENCE);
		assertDocExampleFence(run(DOC_EXAMPLE_FENCE), DOC_EXAMPLE_FENCE);
		hl.dispose();
	});

	it('JavaScript engine: fenced [/DOC]/[/example] stay fenced, real closers still close', async () => {
		const hl = await jsHighlighter();
		const run = (src: string) => hl.codeToTokens(src, { lang: 'sdoc', theme: 'github-dark', includeExplanation: true }).tokens as Tokens;
		assertDocFence(run(DOC_FENCE), DOC_FENCE);
		assertDocTildeFence(run(DOC_TILDE), DOC_TILDE);
		assertDocJsFence(run(DOC_JS_FENCE), DOC_JS_FENCE);
		assertDocExampleFence(run(DOC_EXAMPLE_FENCE), DOC_EXAMPLE_FENCE);
		hl.dispose();
	});
});

/**
 * The grammar spells the note types out in a regex alternation, and the parser
 * spells them out in an array. They have drifted before: an audit found the
 * grammar still colouring three words that had been removed and missing five
 * that had been added, so valid notes rendered as plain text and invalid ones
 * looked accepted. Nothing else compares the two lists.
 */
describe('note types match the parser', () => {
	it('the grammar accepts exactly the types the parser does', () => {
		// Every `match` string in the grammar, however deeply nested.
		const patterns: string[] = [];
		const walk = (node: unknown) => {
			if (Array.isArray(node)) return node.forEach(walk);
			if (node && typeof node === 'object') {
				for (const [key, value] of Object.entries(node)) {
					if (key === 'match' && typeof value === 'string') patterns.push(value);
					else walk(value);
				}
			}
		};
		walk(grammar);
		// The note/todo line rule: `- bug: …`, `- [ ] …`, or a bare `- …`.
		const hit = patterns.map((p) => /\(\?:([a-z0-9|]+)\):\)/.exec(p)).find(Boolean);
		expect(hit, 'note-type alternation not found in the grammar').toBeTruthy();
		expect(hit![1].split('|').sort()).toEqual([...NOTE_TYPES].sort());
	});
});

/**
 * A grammar desync is silent and total: once a begin/end region fails to
 * close, every line after it loses its scopes, and the file just renders as
 * plain text from that point on. Nothing errors.
 *
 * The tell is an entity closer. The scanner knows which `[/DOC]` lines are
 * real and which are sitting inside a code fence as an example of the syntax —
 * it walks fences to decide. A real closer that comes out unscoped means the
 * grammar lost its place somewhere above it.
 */
describe('the grammar keeps its place over the whole docs corpus', () => {
	it('scopes every real entity closer', async () => {
		const docs = resolve(__dirname, '../../../../apps/docs/src');
		const files = (function walk(dir: string): string[] {
			return readdirSync(dir).flatMap((name) => {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) return walk(path);
				return name.endsWith('.sdoc') ? [path] : [];
			});
		})(docs);
		expect(files.length).toBeGreaterThan(20);

		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const unscoped: string[] = [];
		let checked = 0;
		for (const file of files) {
			const source = readFileSync(file, 'utf-8');
			const lines = source.split('\n');
			const { tokens } = hl.codeToTokens(source, { lang: 'sdoc', theme: 'github-dark' });
			for (const entity of scanSdoc(source, file).entities) {
				// The closer is the last line the entity's span covers.
				const end = source.slice(0, entity.span.end).split('\n').length - 1;
				if (!/^\[\/[A-Z]+\]$/.test((lines[end] ?? '').trim())) continue;
				checked++;
				const colors = new Set((tokens[end] ?? []).map((t) => t.color));
				if (colors.size === 1 && colors.has(PLAIN.toUpperCase())) {
					unscoped.push(`${file.slice(docs.length + 1)}:${end + 1}`);
				}
			}
		}
		hl.dispose();
		expect(checked).toBeGreaterThan(20);
		expect(unscoped).toEqual([]);
	});
});

/**
 * Text blocks nested inside an [EXAMPLE] body, and wrapped entity openers.
 *
 * Both were the same shape of gap: a rule that exists and works at one level
 * was simply not reachable from another. `[NOTES]` inside an example fell
 * through to `source.svelte`, whose text region carries no name, so the block
 * rendered as plain markup. And `[DOC` / `[PAGE` matched their opener with a
 * single-line `(.*)$`, so the attribute lines of a wrapped opener — the shape
 * the extension's own formatter writes — belonged to nothing.
 */
const NESTED_TEXT_BLOCKS = `[SHOWCASE title="Forms / Button"]

	[EXAMPLE title="Ghost"]
		[NOTES]
			- warning: Not final.
		[/NOTES]
		[TODO]
			- [ ] Add a dark-mode case
		[/TODO]
		[PROSE]
			A **caption**.
		[/PROSE]
		<Button variant="ghost" />
	[/EXAMPLE]

[/SHOWCASE]
`;

const WRAPPED_ENTITIES = `[DOC
	title="Guide"
	slug="guide"
]

	## Heading

[/DOC]

[PAGE
	title="Welcome"
	maxWidth="880px"
]

	<h1>Hi</h1>

[/PAGE]
`;

describe('scopes that were unreachable from one level down', () => {
	it('scopes a [NOTES]/[TODO]/[PROSE] block inside an [EXAMPLE]', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const { tokens } = hl.codeToTokens(NESTED_TEXT_BLOCKS, {
			lang: 'sdoc',
			theme: 'github-dark',
			includeExplanation: true,
		});
		const lines = NESTED_TEXT_BLOCKS.split('\n');
		for (const tag of ['[NOTES]', '[/NOTES]', '[TODO]', '[/TODO]', '[PROSE]', '[/PROSE]']) {
			const li = lines.findIndex((l) => l.trim() === tag);
			const scopes = (tokens[li] ?? []).flatMap(
				(t) => t.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? [],
			);
			expect(scopes.some((s) => s.includes('keyword.control.block.sdoc')), tag).toBe(true);
		}
		// The markup after the blocks is still Svelte, and the example still closes.
		const closer = lines.findIndex((l) => l.trim() === '[/EXAMPLE]');
		expect(colorOf(tokens as Tokens, lines, '[/EXAMPLE]'), '[/EXAMPLE]').not.toBe(PLAIN);
		expect(closer).toBeGreaterThan(0);
		hl.dispose();
	});

	it('scopes the attribute lines of a wrapped [DOC] and [PAGE] opener', async () => {
		const hl = await createHighlighter({
			themes: ['github-dark'],
			langs: [
				'javascript', 'typescript', 'css', 'svelte', 'markdown', 'html',
				{ ...grammar, name: 'sdoc', embeddedLangs: ['svelte', 'typescript', 'javascript', 'css', 'markdown'] },
			],
		});
		const { tokens } = hl.codeToTokens(WRAPPED_ENTITIES, {
			lang: 'sdoc',
			theme: 'github-dark',
			includeExplanation: true,
		});
		const lines = WRAPPED_ENTITIES.split('\n');
		for (const attr of ['title="Guide"', 'slug="guide"', 'title="Welcome"', 'maxWidth="880px"']) {
			const li = lines.findIndex((l) => l.trim() === attr);
			const scopes = (tokens[li] ?? []).flatMap(
				(t) => t.explanation?.flatMap((e) => e.scopes.map((s) => s.scopeName)) ?? [],
			);
			expect(scopes.some((s) => s.includes('entity.other.attribute-name.sdoc')), attr).toBe(true);
		}
		// The bodies still work: the heading is markdown, and both entities close.
		expect(colorOf(tokens as Tokens, lines, '[/DOC]'), '[/DOC]').not.toBe(PLAIN);
		expect(colorOf(tokens as Tokens, lines, '[/PAGE]'), '[/PAGE]').not.toBe(PLAIN);
		hl.dispose();
	});
});
