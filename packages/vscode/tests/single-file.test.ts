/**
 * Single-file windows: VS Code sends rootUri null and no workspace folders
 * when a lone .sdoc file is opened without a folder. The embedded
 * svelte-language-server used to receive that null root, start its fallback
 * watcher at the filesystem root, and die on the first unreadable mount
 * (EBUSY on /dev/diskN) ~2s after `initialized` — a 5-restart crash loop and
 * zero language features. The server must instead stay alive (root derived
 * from the first opened document) and keep serving.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startClient, type LspClient, SERVER, DOCS } from './helpers/lsp';

const NOTICE = resolve(DOCS, 'src/ui/Notice.sdoc');
const uri = 'file://' + NOTICE;
const source = readFileSync(NOTICE, 'utf-8');
const lines = source.split('\n');

let client: LspClient;
let exited: { code: number | null; signal: string | null } | null = null;

beforeAll(async () => {
	client = await startClient(SERVER, 'stdio', null);
	client.child.on('exit', (code, signal) => {
		exited = { code, signal };
	});
});

afterAll(() => client?.dispose());

describe('server with rootUri null (single-file window)', () => {
	it('stays alive and publishes diagnostics for an opened document', async () => {
		await client.openDoc(uri, source);
		const publish = await client.waitForDiagnostics(uri, (p) => p.diagnostics.length === 0);
		expect(publish.uri).toBe(uri);
		// The historical crash fired ~2s after `initialized`; give any
		// background watcher failure room to surface, then require liveness.
		await new Promise((r) => setTimeout(r, 4000));
		expect(exited).toBeNull();
		expect(client.child.exitCode).toBeNull();
	});

	it('still answers position requests end-to-end afterwards', async () => {
		const line = lines.findIndex((l) => l.includes('<Notice'));
		const hover = await client.connection.sendRequest('textDocument/hover', {
			textDocument: { uri },
			position: { line, character: lines[line].indexOf('Notice') + 2 },
		});
		expect(hover).toBeTruthy();
		expect(exited).toBeNull();
	});
});
