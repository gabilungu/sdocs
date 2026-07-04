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

	it('formats block bodies without touching block tags or structure', async () => {
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
});
