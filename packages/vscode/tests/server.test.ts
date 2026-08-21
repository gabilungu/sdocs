/**
 * The sdoc language server, driven over real LSP against the bundled
 * dist/server.js: diagnostics land on authored lines, hover/completion
 * work inside block bodies, and formatting cleans Svelte fragments while
 * never touching block tags.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { startClient, type LspClient, SERVER, DOCS } from './helpers/lsp';

const NOTICE = resolve(DOCS, 'src/ui/Notice.sdoc');
const uri = 'file://' + NOTICE;
const source = readFileSync(NOTICE, 'utf-8');
const lines = source.split('\n');

let client: LspClient;

beforeAll(async () => {
	client = await startClient(SERVER, 'stdio', DOCS);
	await client.openDoc(uri, source);
});

afterAll(() => client?.dispose());

describe('sdoc language server over LSP', () => {
	it('publishes zero diagnostics for a clean corpus file', async () => {
		const first = await client.waitForDiagnostics(uri, () => true);
		expect(first.diagnostics).toEqual([]);
	});

	it('does not advertise space as a completion trigger', () => {
		// Advertising a trigger character the embedded Svelte server ignores
		// (space) makes VS Code cache an empty result and show "No
		// suggestions" as you type component attributes.
		const cp = client.initializeResult.capabilities.completionProvider as {
			triggerCharacters?: string[];
		};
		expect(cp.triggerCharacters).toBeDefined();
		expect(cp.triggerCharacters).not.toContain(' ');
	});

	it('completes a component prop typed inside an example body', async () => {
		// The regression the trigger-character fix addresses: typing
		// `<Notice t…` should offer the component's `title` prop.
		const bodyLine = lines.findIndex((l) => l.includes('<Notice') && l.includes('{...args}'));
		const probe = source.split('\n');
		const insertAt = bodyLine + 1;
		probe.splice(insertAt, 0, '\t\t<Notice t />');
		await client.changeDoc(uri, 10, probe.join('\n'));
		const line = insertAt;
		const character = '\t\t<Notice t'.length;
		const res = (await client.connection.sendRequest('textDocument/completion', {
			textDocument: { uri },
			position: { line, character },
			context: { triggerKind: 1 },
		})) as { items?: { label: string }[] } | { label: string }[] | null;
		const items = Array.isArray(res) ? res : (res?.items ?? []);
		expect(items.some((i) => i.label === 'title')).toBe(true);
		await client.changeDoc(uri, 11, source);
	});

	it('reports an injected error at the authored line', async () => {
		const brokenLine = lines.findIndex((l) => l.includes('{...args}'));
		const broken = source.replace('{...args}', '{...args} onclick={notAThing}');
		await client.changeDoc(uri, 2, broken);
		const publish = await client.waitForDiagnostics(uri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes('notAThing')),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes('notAThing'))!;
		expect(hit.range.start.line).toBe(brokenLine);
		// restore
		await client.changeDoc(uri, 3, source);
	});

	it('answers hover on a component tag in a preview body', async () => {
		const line = lines.findIndex((l) => l.includes('<Notice'));
		const character = lines[line].indexOf('Notice') + 2;
		const hover = await client.connection.sendRequest('textDocument/hover', {
			textDocument: { uri },
			position: { line, character },
		});
		expect(hover).toBeTruthy();
	});

	it('offers no completions on a block-opener line', async () => {
		// Opener lines project to generated {#snippet} wrappers; a forwarded
		// completion there offers e.g. `{/snippet}` whose textEdit REPLACES
		// authored opener text — same gate as hover/definition/signature.
		const line = lines.findIndex((l) => l.includes('[COMPONENT'));
		const res = (await client.connection.sendRequest('textDocument/completion', {
			textDocument: { uri },
			position: { line, character: lines[line].indexOf('component=') },
			context: { triggerKind: 1 },
		})) as { items?: unknown[] } | unknown[] | null;
		const items = Array.isArray(res) ? res : (res?.items ?? []);
		expect(items).toEqual([]);
	});

	it('definition of a snippet arg never targets a generated wrapper line', async () => {
		// `args` is declared by the generated {#snippet} wrapper on the
		// [COMPONENT] opener line — a target with virtual coordinates that used
		// to come back as a garbage span inside the authored opener. Dropped
		// entirely: fewer results beat wrong ones.
		const line = lines.findIndex((l) => l.includes('{...args}'));
		const character = lines[line].indexOf('args') + 1;
		const res = (await client.connection.sendRequest('textDocument/definition', {
			textDocument: { uri },
			position: { line, character },
		})) as { uri: string; range: { start: { line: number } } }[] | { uri: string } | null;
		const locs = res == null ? [] : Array.isArray(res) ? res : [res];
		expect(locs).toEqual([]);
	});

	it('still maps real definitions (component tag resolves to its .svelte file)', async () => {
		const line = lines.findIndex((l) => l.includes('<Notice'));
		const character = lines[line].indexOf('Notice') + 2;
		const res = (await client.connection.sendRequest('textDocument/definition', {
			textDocument: { uri },
			position: { line, character },
		})) as { uri: string }[] | { uri: string } | null;
		const locs = res == null ? [] : Array.isArray(res) ? res : [res];
		expect(locs.length).toBeGreaterThan(0);
		expect(locs.every((l) => l.uri.endsWith('.svelte') || l.uri.endsWith('.sdoc'))).toBe(true);
		expect(locs.some((l) => l.uri.endsWith('Notice.svelte'))).toBe(true);
	});

	it('answers completion inside markup', async () => {
		const line = lines.findIndex((l) => l.includes('<Notice'));
		const completions = (await client.connection.sendRequest('textDocument/completion', {
			textDocument: { uri },
			position: { line, character: lines[line].indexOf('<Notice') + 1 },
		})) as { items?: unknown[] } | unknown[] | null;
		const count = Array.isArray(completions)
			? completions.length
			: (completions?.items?.length ?? 0);
		expect(count).toBeGreaterThan(10);
	});

	it('formats block bodies without reformatting tag attributes', async () => {
		const messy = source.replace('<Notice {...args}', '<Notice     {...args}');
		await client.changeDoc(uri, 4, messy);
		const edits = (await client.connection.sendRequest('textDocument/formatting', {
			textDocument: { uri },
			options: { tabSize: 4, insertSpaces: false },
		})) as { newText: string }[] | null;
		expect(edits?.[0]).toBeTruthy();
		const formatted = edits![0].newText;
		// The body island reflows...
		expect(formatted).not.toContain('<Notice     {...args}');
		// ...but the opener's attributes are copied verbatim (this opener is
		// long enough to wrap to one attribute per line — never rewritten).
		expect(formatted).toContain('component={Notice}');
		expect(formatted).toContain(
			"args={{ title: 'Build finished', tone: 'success', dismissible: true, count: 1 }}",
		);
		expect(formatted).toContain('[/COMPONENT]');
		expect(formatted).toContain('[/SHOWCASE]');
		await client.changeDoc(uri, 5, source);
	});

	it('shows sdoc docs when hovering a block tag, not snippet-wrapper docs', async () => {
		const hoverAt = (line: number, character: number) =>
			client.connection.sendRequest('textDocument/hover', {
				textDocument: { uri },
				position: { line, character },
			}) as Promise<{ contents?: { value?: string } } | null>;

		const docsLine = lines.findIndex((l) => l.includes('[SHOWCASE'));
		const opener = await hoverAt(docsLine, lines[docsLine].indexOf('[SHOWCASE') + 2);
		expect(opener?.contents?.value).toContain('component documentation entity');
		expect(opener?.contents?.value).not.toContain('{#snippet');

		const previewLine = lines.findIndex((l) => l.includes('[COMPONENT'));
		const preview = await hoverAt(previewLine, lines[previewLine].indexOf('[COMPONENT') + 3);
		expect(preview?.contents?.value).toContain('live component panel');

		const closerLine = lines.findIndex((l) => l.includes('[/SHOWCASE]'));
		const closer = await hoverAt(closerLine, lines[closerLine].indexOf('[/SHOWCASE]') + 3);
		expect(closer?.contents?.value).toContain('component documentation entity');

		// past the tag token (in the attributes) there is nothing to say
		const past = await hoverAt(docsLine, lines[docsLine].indexOf('title='));
		expect(past).toBeNull();
	});

	it('formats PAGE bodies as markdown, leaving expressions and tags alone', async () => {
		const pageUri = 'file://' + resolve(DOCS, 'src/ui/__fmt-page.sdoc');
		const page = [
			'[DOC title="T"]',
			'',
			'\t# Hello',
			'',
			'\t* one',
			'\t* two',
			'',
			"\t{@render colorBox('#ff0000')}",
			'',
			'[/DOC]',
			'',
		].join('\n');
		await client.openDoc(pageUri, page);
		const edits = (await client.connection.sendRequest('textDocument/formatting', {
			textDocument: { uri: pageUri },
			options: { tabSize: 4, insertSpaces: false },
		})) as { newText: string }[] | null;
		expect(edits?.[0]).toBeTruthy();
		const formatted = edits![0].newText;
		// markdown normalized (prettier bullets are '-') and re-indented one tab
		expect(formatted).toContain('\t- one');
		expect(formatted).toContain('\t- two');
		expect(formatted).toContain('\t# Hello');
		// the island formats as a Svelte fragment (prettier's double quotes)
		expect(formatted).toContain('{@render colorBox("#ff0000")}');
		expect(formatted).toContain('[DOC title="T"]');
		expect(formatted).toContain('[/DOC]');
	});

	it('re-indents messy Svelte islands as Svelte fragments (multi-section PAGE)', async () => {
		const pageUri = 'file://' + resolve(DOCS, 'src/ui/__fmt-islands.sdoc');
		const page = [
			'[DOC title="Sections"]',
			'',
			'\t## One',
			'',
			// messy: wrong depths everywhere
			'\t\t{#snippet colorBox(color: string)}',
			'\t\t\t\t<div style="background-color:{color}; width:100px; height:100px;">',
			'\t\t<div>asdAS',
			'\t\t</div>',
			'\t</div>',
			'{/snippet}',
			'',
			'\t## Two',
			'',
			'\t<div style="display:flex;">',
			"\t\t{@render colorBox('#ff0000')}",
			'\t</div>',
			'',
			'[/DOC]',
			'',
		].join('\n');
		await client.openDoc(pageUri, page);
		const edits = (await client.connection.sendRequest('textDocument/formatting', {
			textDocument: { uri: pageUri },
			options: { tabSize: 4, insertSpaces: false },
		})) as { newText: string }[] | null;
		expect(edits?.[0]).toBeTruthy();
		const formatted = edits![0].newText;
		// the snippet island is re-indented canonically at the body indent
		expect(formatted).toContain(
			[
				'\t{#snippet colorBox(color: string)}',
				'\t\t<div style="background-color:{color}; width:100px; height:100px;">',
				'\t\t\t<div>asdAS</div>',
				'\t\t</div>',
				'\t{/snippet}',
			].join('\n'),
		);
		// the second island normalizes too (quotes become double, tabs canonical)
		expect(formatted).toContain(
			['\t<div style="display:flex;">', '\t\t{@render colorBox("#ff0000")}', '\t</div>'].join('\n'),
		);
		// prose still formats around them
		expect(formatted).toContain('\t## One');
		expect(formatted).toContain('\t## Two');
	});
});

describe('block-level <script>/<style> (per-block virtual docs)', () => {
	const blockUri = 'file://' + resolve(DOCS, 'src/ui/__BlockScript.sdoc');
	const blockSource = `<script lang="ts">
	import Notice from './Notice.svelte';
</script>

[SHOWCASE title="Block"]

	[EXAMPLE title="Scoped"]
		<script lang="ts">
			const localItems = ["a", "b"];
			let localCount = $state(2);
		</script>
		<Notice title={localItems[0]}>x</Notice>
		<p class="picked">{localCount}</p>
		<style>
			.picked { color: gray; }
		</style>
	[/EXAMPLE]

[/SHOWCASE]
`;

	const blockPath = resolve(DOCS, 'src/ui/__BlockScript.sdoc');

	afterAll(() => rmSync(blockPath, { force: true }));

	it('markup referencing block-script variables draws no false diagnostics', async () => {
		writeFileSync(blockPath, blockSource);
		await client.openDoc(blockUri, blockSource);
		const publish = await client.waitForDiagnostics(blockUri, () => true);
		const messages = publish.diagnostics.map((d) => String(d.message));
		expect(messages.filter((m) => m.includes('localCount') || m.includes('localItems'))).toEqual([]);
	});

	it('type errors inside a block script surface at the authored line', async () => {
		const broken = blockSource.replace(
			'let localCount = $state(2);',
			'let localCount = $state(2);\n\t\t\tconst oops: number = "not a number";',
		);
		await client.changeDoc(blockUri, 2, broken);
		const publish = await client.waitForDiagnostics(blockUri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes('not assignable')),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes('not assignable'))!;
		const brokenLine = broken.split('\n').findIndex((l) => l.includes('const oops'));
		expect(hit.range.start.line).toBe(brokenLine);
		// restore
		await client.changeDoc(blockUri, 3, blockSource);
	});
});

describe('entity-script import used only by a later block', () => {
	const entityPath = resolve(DOCS, 'src/ui/__EntityImport.sdoc');
	const entityUri = 'file://' + entityPath;
	const entitySource = `[SHOWCASE title="Entity import"]
	<script lang="ts">
		import Notice from './Notice.svelte';
		const probe: number = 1;
	</script>

	[EXAMPLE title="Plain"]
		<b>no component here, just {probe}</b>
	[/EXAMPLE]

	[EXAMPLE title="Uses it"]
		<Notice title="hi">x</Notice>
	[/EXAMPLE]

	[EXAMPLE title="Scripted"]
		<script lang="ts">
			const localThing = 3;
		</script>
		<i>{localThing}</i>
	[/EXAMPLE]

[/SHOWCASE]
`;

	afterAll(() => rmSync(entityPath, { force: true }));

	it('draws no unused-import hint when only a LATER block uses the import', async () => {
		writeFileSync(entityPath, entitySource);
		await client.openDoc(entityUri, entitySource);
		// Deterministic wait: break the probe const — its error comes from the
		// same virtual doc that owns the import line, so the publish carrying
		// it would carry an unused-import hint too, if one existed. The same
		// publish would also carry any leaked entity-doc error on the third
		// block's markup ({localThing} has no declaration in the entity doc —
		// the block doc owns those lines).
		const broken = entitySource.replace('const probe: number = 1;', 'const probe: number = "s";');
		await client.changeDoc(entityUri, 2, broken);
		const publish = await client.waitForDiagnostics(entityUri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes('not assignable')),
		);
		const messages = publish.diagnostics.map((d) => String(d.message));
		expect(
			messages.filter(
				(m) => m.includes('never read') || m.includes("'Notice'") || m.includes('localThing'),
			),
		).toEqual([]);
	});

	it('an import used by NO block still flags as unused, at the authored line', async () => {
		const unused = entitySource.replace(
			"import Notice from './Notice.svelte';",
			"import Notice from './Notice.svelte';\n\t\timport Unused from './Notice.svelte';",
		);
		await client.changeDoc(entityUri, 3, unused);
		const publish = await client.waitForDiagnostics(entityUri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes("'Unused'")),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes("'Unused'"))!;
		const importLine = unused.split('\n').findIndex((l) => l.includes('import Unused'));
		expect(hit.range.start.line).toBe(importLine);
		expect(String(hit.message)).toContain('never read');
		// The genuinely-used import stays clean in the same publish.
		const messages = publish.diagnostics.map((d) => String(d.message));
		expect(messages.filter((m) => m.includes("'Notice'"))).toEqual([]);
	});
});

describe('diagnostic publishes are version-stamped, stale coordinates withheld', () => {
	const vPath = resolve(DOCS, 'src/ui/__VersionStamp.sdoc');
	const vUri = 'file://' + vPath;
	// The file <script lang="ts"> puts the projection in TS mode, where the
	// unknown name is a real error.
	const v1 = [
		'<script lang="ts">',
		'\tconst probe = 1;',
		'</script>',
		'',
		'[SHOWCASE title="V"]',
		'',
		'\t[EXAMPLE title="A"]',
		'\t\t<b>{probe + notAThing}</b>',
		'\t[/EXAMPLE]',
		'',
		'[/SHOWCASE]',
		'',
	].join('\n');
	// two pad lines shift the error two lines down
	const v2 = v1.replace('\t\t<b>', '\t\t<i>pad</i>\n\t\t<i>pad</i>\n\t\t<b>');
	const oldLine = v1.split('\n').findIndex((l) => l.includes('notAThing'));
	const newLine = v2.split('\n').findIndex((l) => l.includes('notAThing'));

	afterAll(() => rmSync(vPath, { force: true }));

	it('after an edit, no publish for the new version carries old coordinates', async () => {
		writeFileSync(vPath, v1);
		await client.openDoc(vUri, v1);
		await client.waitForDiagnostics(vUri, (p) =>
			p.diagnostics.some(
				(d) => String(d.message).includes('notAThing') && d.range.start.line === oldLine,
			),
		);
		await client.changeDoc(vUri, 42, v2);
		const fresh = await client.waitForDiagnostics(vUri, (p) =>
			p.diagnostics.some(
				(d) => String(d.message).includes('notAThing') && d.range.start.line === newLine,
			),
		);
		// publishes carry the authored document version they derive from...
		expect(fresh.version).toBe(42);
		// ...and every post-edit publish places the diagnostic at the new
		// line — the superseded pre-edit coordinates are never re-published
		// against the new version.
		const stale = (client.diagnostics.get(vUri) ?? []).filter(
			(p) =>
				p.version === 42 &&
				p.diagnostics.some(
					(d) => String(d.message).includes('notAThing') && d.range.start.line !== newLine,
				),
		);
		expect(stale).toEqual([]);
	});
});

describe('single-line <script> tags are live (recomposed content spans)', () => {
	const slPath = resolve(DOCS, 'src/ui/__SingleLineScript.sdoc');
	const slUri = 'file://' + slPath;
	// The review repro: a block script written on ONE line, plus a sentinel
	// markup error ({alsoNope}) owned by the same virtual doc.
	const slSource = [
		'[SHOWCASE title="One line"]',
		'',
		'\t[EXAMPLE title="A"]',
		'\t\t<script lang="ts">const bad: string = 1;</script>',
		'\t\t<i>{bad}</i>',
		'\t\t<b>{alsoNope}</b>',
		'\t[/EXAMPLE]',
		'',
		'[/SHOWCASE]',
		'',
	].join('\n');
	const slLines = slSource.split('\n');
	const scriptLine = slLines.findIndex((l) => l.includes('const bad'));
	const badCol = slLines[scriptLine].indexOf('bad');

	afterAll(() => rmSync(slPath, { force: true }));

	it('surfaces the type error at the authored line AND columns, sentinel included', async () => {
		writeFileSync(slPath, slSource);
		await client.openDoc(slUri, slSource);
		// One publish must carry BOTH: the script's type error (previously
		// dropped by the wrapper-line gate) and the markup sentinel.
		const publish = await client.waitForDiagnostics(
			slUri,
			(p) =>
				p.diagnostics.some((d) => String(d.message).includes('not assignable')) &&
				p.diagnostics.some((d) => String(d.message).includes('alsoNope')),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes('not assignable'))!;
		expect(hit.range.start.line).toBe(scriptLine);
		expect(hit.range.start.character).toBe(badCol);
		expect(hit.range.end.line).toBe(scriptLine);
		expect(hit.range.end.character).toBe(badCol + 'bad'.length);
	});

	it('answers hover over a symbol inside the single-line script', async () => {
		const hover = (await client.connection.sendRequest('textDocument/hover', {
			textDocument: { uri: slUri },
			position: { line: scriptLine, character: badCol + 1 },
		})) as { contents?: unknown } | null;
		expect(hover).toBeTruthy();
		expect(hover?.contents).toBeTruthy();
	});

	it('maps a definition target INTO the single-line script span', async () => {
		const markupLine = slLines.findIndex((l) => l.includes('<i>{bad}</i>'));
		const res = (await client.connection.sendRequest('textDocument/definition', {
			textDocument: { uri: slUri },
			position: { line: markupLine, character: slLines[markupLine].indexOf('bad') + 1 },
		})) as
			| { uri: string; range: { start: { line: number; character: number } } }[]
			| {
					targetUri: string;
					targetSelectionRange: { start: { line: number; character: number } };
			  }[]
			| null;
		const locs = res == null ? [] : Array.isArray(res) ? res : [res];
		expect(locs.length).toBeGreaterThan(0);
		const target = locs[0] as Record<string, unknown>;
		const uri = (target.uri ?? target.targetUri) as string;
		const start = ((target.range ?? target.targetSelectionRange) as {
			start: { line: number; character: number };
		}).start;
		expect(uri).toBe(slUri);
		expect(start.line).toBe(scriptLine);
		expect(start.character).toBe(badCol);
	});

	it('completes inside the span; the tag text outside it stays empty', async () => {
		// Inside: value position after `= ` — scope completions flow.
		const inside = slLines[scriptLine].indexOf('= 1;') + 2;
		const res = (await client.connection.sendRequest('textDocument/completion', {
			textDocument: { uri: slUri },
			position: { line: scriptLine, character: inside },
			context: { triggerKind: 1 },
		})) as { items?: unknown[] } | unknown[] | null;
		const items = Array.isArray(res) ? res : (res?.items ?? []);
		expect(items.length).toBeGreaterThan(0);
		// Outside: on the generated `<script lang="ts">` tag text.
		const onTag = (await client.connection.sendRequest('textDocument/completion', {
			textDocument: { uri: slUri },
			position: { line: scriptLine, character: slLines[scriptLine].indexOf('script') },
			context: { triggerKind: 1 },
		})) as { items?: unknown[] } | unknown[] | null;
		const tagItems = Array.isArray(onTag) ? onTag : (onTag?.items ?? []);
		expect(tagItems).toEqual([]);
	});
});

describe('single-line ENTITY <script> is live too', () => {
	const ePath = resolve(DOCS, 'src/ui/__SingleLineEntity.sdoc');
	const eUri = 'file://' + ePath;
	const eSource = [
		'[SHOWCASE title="Entity one line"]',
		'\t<script lang="ts">const worse: string = 2;</script>',
		'',
		'\t[EXAMPLE title="A"]',
		'\t\t<b>{worse}</b>',
		'\t[/EXAMPLE]',
		'',
		'[/SHOWCASE]',
		'',
	].join('\n');
	const eLines = eSource.split('\n');
	const scriptLine = eLines.findIndex((l) => l.includes('const worse'));

	afterAll(() => rmSync(ePath, { force: true }));

	it('surfaces the type error at the authored line and columns', async () => {
		writeFileSync(ePath, eSource);
		await client.openDoc(eUri, eSource);
		const publish = await client.waitForDiagnostics(eUri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes('not assignable')),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes('not assignable'))!;
		expect(hit.range.start.line).toBe(scriptLine);
		expect(hit.range.start.character).toBe(eLines[scriptLine].indexOf('worse'));
	});

	it('answers hover inside the entity one-liner', async () => {
		const hover = await client.connection.sendRequest('textDocument/hover', {
			textDocument: { uri: eUri },
			position: { line: scriptLine, character: eLines[scriptLine].indexOf('worse') + 1 },
		});
		expect(hover).toBeTruthy();
	});
});

describe('entity-level <script> in a [DOC] (per-entity virtual doc)', () => {
	const docPath = resolve(DOCS, 'src/ui/__EntityScriptDoc.sdoc');
	const docUri = 'file://' + docPath;
	const docSource = `[DOC title="Entity scope"]
	<script lang="ts">
		const answer = 42;
	</script>

	The answer is {answer}.

[/DOC]
`;

	afterAll(() => rmSync(docPath, { force: true }));

	it('prose referencing the entity script draws no false diagnostics', async () => {
		writeFileSync(docPath, docSource);
		await client.openDoc(docUri, docSource);
		const publish = await client.waitForDiagnostics(docUri, () => true);
		const messages = publish.diagnostics.map((d) => String(d.message));
		expect(messages.filter((m) => m.includes('answer'))).toEqual([]);
	});

	it('type errors inside the entity script surface even with zero examples', async () => {
		const broken = docSource.replace(
			'const answer = 42;',
			'const answer = 42;\n\t\tconst oops: number = "not a number";',
		);
		await client.changeDoc(docUri, 2, broken);
		const publish = await client.waitForDiagnostics(docUri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes('not assignable')),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes('not assignable'))!;
		const brokenLine = broken.split('\n').findIndex((l) => l.includes('const oops'));
		expect(hit.range.start.line).toBe(brokenLine);
	});
});
