/** A minimal LSP client for driving the bundled sdoc language server. */

import { fork, spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import {
	createProtocolConnection,
	StreamMessageReader,
	StreamMessageWriter,
	IPCMessageReader,
	IPCMessageWriter,
	type ProtocolConnection,
	type PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol/node';

export const SERVER = resolve(__dirname, '../../dist/server.js');
export const REPO = resolve(__dirname, '../../../..');
export const DOCS = resolve(REPO, 'apps/docs');

export interface LspClient {
	connection: ProtocolConnection;
	child: ChildProcess;
	/** The server's initialize result (capabilities, etc.) */
	initializeResult: { capabilities: Record<string, unknown> };
	/** All publishes received, per uri, newest last */
	diagnostics: Map<string, PublishDiagnosticsParams[]>;
	openDoc(uri: string, text: string): Promise<void>;
	changeDoc(uri: string, version: number, text: string): Promise<void>;
	/** Wait until a publish for uri satisfies the predicate (or time out) */
	waitForDiagnostics(
		uri: string,
		predicate: (p: PublishDiagnosticsParams) => boolean,
		timeoutMs?: number,
	): Promise<PublishDiagnosticsParams>;
	dispose(): void;
}

export async function startClient(
	serverPath: string,
	transport: 'stdio' | 'ipc',
	/** null reproduces a single-file window: rootUri null, no folders */
	rootDir: string | null,
): Promise<LspClient> {
	let child: ChildProcess;
	let connection: ProtocolConnection;
	if (transport === 'stdio') {
		child = spawn('node', [serverPath, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
		connection = createProtocolConnection(
			new StreamMessageReader(child.stdout!),
			new StreamMessageWriter(child.stdin!),
		);
	} else {
		child = fork(serverPath, ['--node-ipc'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
		connection = createProtocolConnection(new IPCMessageReader(child), new IPCMessageWriter(child));
	}

	const diagnostics = new Map<string, PublishDiagnosticsParams[]>();
	const waiters: (() => void)[] = [];
	connection.onNotification('textDocument/publishDiagnostics', (p: PublishDiagnosticsParams) => {
		const list = diagnostics.get(p.uri) ?? [];
		list.push(p);
		diagnostics.set(p.uri, list);
		for (const wake of waiters.splice(0)) wake();
	});
	connection.onRequest('workspace/configuration', (p: { items: unknown[] }) =>
		p.items.map(() => null),
	);
	connection.onUnhandledNotification(() => {});
	connection.listen();

	const initializeResult = (await connection.sendRequest('initialize', {
		processId: process.pid,
		rootUri: rootDir ? 'file://' + rootDir : null,
		workspaceFolders: rootDir ? [{ uri: 'file://' + rootDir, name: 'test' }] : null,
		capabilities: {},
	})) as { capabilities: Record<string, unknown> };
	await connection.sendNotification('initialized', {});

	let version = 0;
	return {
		connection,
		child,
		initializeResult,
		diagnostics,
		async openDoc(uri, text) {
			await connection.sendNotification('textDocument/didOpen', {
				textDocument: { uri, languageId: 'sdoc', version: ++version, text },
			});
		},
		async changeDoc(uri, v, text) {
			await connection.sendNotification('textDocument/didChange', {
				textDocument: { uri, version: v },
				contentChanges: [{ text }],
			});
		},
		waitForDiagnostics(uri, predicate, timeoutMs = 60_000) {
			return new Promise((resolvePromise, reject) => {
				const check = () => {
					const hit = (diagnostics.get(uri) ?? []).findLast(predicate);
					if (hit) {
						clearTimeout(timer);
						resolvePromise(hit);
						return true;
					}
					return false;
				};
				const timer = setTimeout(
					() => reject(new Error(`Timed out waiting for diagnostics on ${uri}`)),
					timeoutMs,
				);
				if (check()) return;
				// Re-register on a non-matching wake: publishes for OTHER docs
				// drain the waiter list too, and must not drop this waiter.
				const wake = () => {
					if (!check()) waiters.push(wake);
				};
				waiters.push(wake);
			});
		},
		dispose() {
			child.kill();
		},
	};
}
