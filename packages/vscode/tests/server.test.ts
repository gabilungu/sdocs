/**
 * The sdoc language server, driven over real LSP against the bundled
 * dist/server.js: diagnostics land on authored lines, hover/completion
 * work inside block bodies, and formatting cleans Svelte fragments while
 * never touching block tags.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startClient, type LspClient, SERVER, SITE } from './helpers/lsp';

const NOTICE = resolve(SITE, 'src/lib/ui/Notice.sdoc');
const uri = 'file://' + NOTICE;
const source = readFileSync(NOTICE, 'utf-8');
const lines = source.split('\n');

let client: LspClient;

beforeAll(async () => {
	client = await startClient(SERVER, 'stdio', SITE);
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
		expect(formatted).not.toContain('<Notice     {...args}');
		expect(formatted).toContain('[preview component={Notice}');
		expect(formatted).toContain('[/preview]');
		expect(formatted).toContain('[/DOCS]');
		await client.changeDoc(uri, 5, source);
	});

	it('shows sdoc docs when hovering a block tag, not snippet-wrapper docs', async () => {
		const hoverAt = (line: number, character: number) =>
			client.connection.sendRequest('textDocument/hover', {
				textDocument: { uri },
				position: { line, character },
			}) as Promise<{ contents?: { value?: string } } | null>;

		const docsLine = lines.findIndex((l) => l.includes('[DOCS'));
		const opener = await hoverAt(docsLine, lines[docsLine].indexOf('[DOCS') + 2);
		expect(opener?.contents?.value).toContain('component documentation entity');
		expect(opener?.contents?.value).not.toContain('{#snippet');

		const previewLine = lines.findIndex((l) => l.includes('[preview'));
		const preview = await hoverAt(previewLine, lines[previewLine].indexOf('[preview') + 3);
		expect(preview?.contents?.value).toContain('live component panel');

		const closerLine = lines.findIndex((l) => l.includes('[/DOCS]'));
		const closer = await hoverAt(closerLine, lines[closerLine].indexOf('[/DOCS]') + 3);
		expect(closer?.contents?.value).toContain('component documentation entity');

		// past the tag token (in the attributes) there is nothing to say
		const past = await hoverAt(docsLine, lines[docsLine].indexOf('title='));
		expect(past).toBeNull();
	});

	it('formats PAGE bodies as markdown, leaving expressions and tags alone', async () => {
		const pageUri = 'file://' + resolve(SITE, 'src/lib/ui/__fmt-page.sdoc');
		const page = [
			'[PAGE title="T"]',
			'',
			'\t# Hello',
			'',
			'\t* one',
			'\t* two',
			'',
			"\t{@render colorBox('#ff0000')}",
			'',
			'[/PAGE]',
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
		expect(formatted).toContain('[PAGE title="T"]');
		expect(formatted).toContain('[/PAGE]');
	});

	it('re-indents messy Svelte islands as Svelte fragments (multi-section PAGE)', async () => {
		const pageUri = 'file://' + resolve(SITE, 'src/lib/ui/__fmt-islands.sdoc');
		const page = [
			'[PAGE title="Sections"]',
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
			'[/PAGE]',
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
