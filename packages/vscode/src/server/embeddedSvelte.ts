/**
 * Runs the real svelte-language-server in-process and speaks LSP to it over
 * an in-memory stream pair. The sdoc server feeds it projected virtual
 * .sdoc.svelte documents and forwards editor requests to it.
 */

import { PassThrough } from 'node:stream';
import { createConnection } from 'vscode-languageserver/node';
import {
	createProtocolConnection,
	StreamMessageReader,
	StreamMessageWriter,
	InitializeRequest,
	InitializedNotification,
	ConfigurationRequest,
	RegistrationRequest,
	WorkspaceFoldersRequest,
	PublishDiagnosticsNotification,
	DiagnosticRefreshRequest,
	type ProtocolConnection,
	type PublishDiagnosticsParams,
	type ServerCapabilities,
} from 'vscode-languageserver-protocol/node';
import { startServer } from 'svelte-language-server';

/** The embedded connection, carrying the capabilities it advertised at
 * initialize — so we mirror its real trigger characters rather than guess. */
export type EmbeddedSvelte = ProtocolConnection & { capabilities: ServerCapabilities };

export async function startEmbeddedSvelte(
	workspaceUri: string | null,
	onDiagnostics: (params: PublishDiagnosticsParams) => void,
	onRefreshDiagnostics: () => void,
): Promise<EmbeddedSvelte> {
	const toServer = new PassThrough();
	const toClient = new PassThrough();

	// Server end: svelte-language-server reads requests from toServer and
	// writes responses/notifications to toClient.
	const serverConnection = createConnection(
		new StreamMessageReader(toServer),
		new StreamMessageWriter(toClient),
	);
	// The embedded server compiled against an older vscode-languageserver;
	// the wire protocol is identical (verified by the headless LSP tests).
	startServer({ connection: serverConnection as never });

	// Client end: our side of the wire.
	const client = createProtocolConnection(
		new StreamMessageReader(toClient),
		new StreamMessageWriter(toServer),
	);

	client.onNotification(PublishDiagnosticsNotification.type, onDiagnostics);

	// Answer the server->client requests svelte-language-server makes.
	client.onRequest(ConfigurationRequest.type, (params) => params.items.map(() => null));
	client.onRequest(RegistrationRequest.type, () => undefined);
	client.onRequest(WorkspaceFoldersRequest.type, () =>
		workspaceUri ? [{ uri: workspaceUri, name: 'workspace' }] : null,
	);
	// Pull-mode diagnostics: on project reload (tsconfig change etc.) the
	// server asks the client to re-pull everything.
	client.onRequest(DiagnosticRefreshRequest.type, () => {
		onRefreshDiagnostics();
	});
	client.onUnhandledNotification(() => undefined);
	client.listen();

	const initResult = await client.sendRequest(InitializeRequest.type, {
		processId: process.pid,
		rootUri: workspaceUri,
		workspaceFolders: workspaceUri ? [{ uri: workspaceUri, name: 'workspace' }] : null,
		capabilities: {
			workspace: {
				configuration: true,
				workspaceFolders: true,
				didChangeConfiguration: { dynamicRegistration: false },
				diagnostics: { refreshSupport: true },
			},
			textDocument: {
				synchronization: { dynamicRegistration: false },
				completion: {
					completionItem: {
						snippetSupport: true,
						documentationFormat: ['markdown', 'plaintext'],
						commitCharactersSupport: true,
						resolveSupport: {
							properties: ['documentation', 'detail', 'additionalTextEdits'],
						},
					},
					contextSupport: true,
				},
				hover: { contentFormat: ['markdown', 'plaintext'] },
				definition: { linkSupport: false },
				publishDiagnostics: { relatedInformation: true },
				// Diagnostics are PULLED per virtual doc (textDocument/diagnostic):
				// each response correlates to the exact authored-document version
				// that produced it, so stale results are identifiable and dropped —
				// push publishes computed against superseded content are not.
				diagnostic: { dynamicRegistration: false },
				signatureHelp: {
					signatureInformation: { documentationFormat: ['markdown', 'plaintext'] },
				},
			},
		},
		initializationOptions: {
			configuration: {
				svelte: { plugin: {} },
			},
		},
	});
	await client.sendNotification(InitializedNotification.type, {});

	const embedded = client as EmbeddedSvelte;
	embedded.capabilities = initResult.capabilities;
	return embedded;
}
