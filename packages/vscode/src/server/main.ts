/**
 * The sdoc language server.
 *
 * Serves language id 'sdoc'. For every open .sdoc document it maintains a
 * line-preserving virtual Svelte projection at a sibling `<file>.svelte`
 * path inside the embedded svelte-language-server, forwards editor requests
 * with identity position mapping, and republishes the embedded server's
 * diagnostics filtered down to authored, verbatim lines. Formatting is
 * fragment-wise prettier — block tags and PAGE prose are never touched.
 */

import {
	createConnection,
	TextDocuments,
	TextDocumentSyncKind,
	ProposedFeatures,
	type Connection,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	DidOpenTextDocumentNotification,
	DidChangeTextDocumentNotification,
	DidCloseTextDocumentNotification,
	CompletionRequest,
	CompletionResolveRequest,
	HoverRequest,
	DefinitionRequest,
	SignatureHelpRequest,
	type Diagnostic,
	type Location,
	type LocationLink,
} from 'vscode-languageserver-protocol';
import { scanSdoc, projectSdoc, type SdocProjection } from 'sdocs/language';
import { startEmbeddedSvelte, type EmbeddedSvelte } from './embeddedSvelte';
import { formatSdoc } from './formatting';

const connection: Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface Tracked {
	projection: SdocProjection;
	version: number;
}

const tracked = new Map<string, Tracked>();
let svelte: Promise<EmbeddedSvelte> | null = null;
let workspaceUri: string | null = null;

function virtualUri(sdocUri: string): string {
	return sdocUri + '.svelte';
}

function sdocUriOf(virtual: string): string {
	return virtual.replace(/\.svelte$/, '');
}

function getSvelte(): Promise<EmbeddedSvelte> {
	svelte ??= startEmbeddedSvelte(workspaceUri, (params) => {
		const sdocUri = sdocUriOf(params.uri);
		const entry = tracked.get(sdocUri);
		if (!entry) return;
		const kept: Diagnostic[] = params.diagnostics.filter((d) => {
			const line = d.range.start.line;
			return line < entry.projection.sourceLineCount &&
				entry.projection.lineKinds[line] === 'verbatim';
		});
		void connection.sendDiagnostics({ uri: sdocUri, diagnostics: kept });
	});
	return svelte;
}

async function syncDocument(doc: TextDocument): Promise<Tracked> {
	const server = await getSvelte();
	const projection = projectSdoc(scanSdoc(doc.getText()));
	const existing = tracked.get(doc.uri);
	const entry: Tracked = { projection, version: (existing?.version ?? 0) + 1 };
	tracked.set(doc.uri, entry);
	if (existing) {
		await server.sendNotification(DidChangeTextDocumentNotification.type, {
			textDocument: { uri: virtualUri(doc.uri), version: entry.version },
			contentChanges: [{ text: projection.text }],
		});
	} else {
		await server.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: {
				uri: virtualUri(doc.uri),
				languageId: 'svelte',
				version: entry.version,
				text: projection.text,
			},
		});
	}
	return entry;
}

connection.onInitialize((params) => {
	workspaceUri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? null;
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: ['.', '"', "'", '`', '/', '@', '<', '#', ':', '|', ' ', '-', '('],
			},
			hoverProvider: true,
			definitionProvider: true,
			signatureHelpProvider: { triggerCharacters: ['(', ','] },
			documentFormattingProvider: true,
		},
	};
});

documents.onDidChangeContent((change) => {
	void syncDocument(change.document).catch((err) =>
		connection.console.error(`sdocs: sync failed for ${change.document.uri}: ${err}`),
	);
});

documents.onDidClose(async (event) => {
	tracked.delete(event.document.uri);
	void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
	const server = await getSvelte();
	await server.sendNotification(DidCloseTextDocumentNotification.type, {
		textDocument: { uri: virtualUri(event.document.uri) },
	});
});

/** Positions map 1:1; only the document URI needs translation. */
function forwardParams<T extends { textDocument: { uri: string } }>(params: T): T {
	return { ...params, textDocument: { ...params.textDocument, uri: virtualUri(params.textDocument.uri) } };
}

/** Map any location pointing into a virtual document back to its .sdoc file. */
function mapLocations<T extends Location | LocationLink>(result: T[] | null): T[] | null {
	if (!result) return result;
	return result.map((loc) => {
		if ('uri' in loc && loc.uri.endsWith('.sdoc.svelte')) {
			return { ...loc, uri: sdocUriOf(loc.uri) };
		}
		if ('targetUri' in loc && loc.targetUri.endsWith('.sdoc.svelte')) {
			return { ...loc, targetUri: sdocUriOf(loc.targetUri) };
		}
		return loc;
	});
}

connection.onCompletion(async (params) => {
	const server = await getSvelte();
	return server.sendRequest(CompletionRequest.type, forwardParams(params));
});

connection.onCompletionResolve(async (item) => {
	const server = await getSvelte();
	return server.sendRequest(CompletionResolveRequest.type, item);
});

connection.onHover(async (params) => {
	const server = await getSvelte();
	return server.sendRequest(HoverRequest.type, forwardParams(params));
});

connection.onDefinition(async (params) => {
	const server = await getSvelte();
	const result = await server.sendRequest(DefinitionRequest.type, forwardParams(params));
	if (Array.isArray(result)) return mapLocations(result as Location[]);
	if (result && 'uri' in result) return mapLocations([result])![0];
	return result;
});

connection.onSignatureHelp(async (params) => {
	const server = await getSvelte();
	return server.sendRequest(SignatureHelpRequest.type, forwardParams(params));
});

connection.onDocumentFormatting(async (params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const source = doc.getText();
	const formatted = await formatSdoc(source, params.options);
	if (formatted === null) return null;
	return [
		{
			range: {
				start: { line: 0, character: 0 },
				end: doc.positionAt(source.length),
			},
			newText: formatted,
		},
	];
});

documents.listen(connection);
connection.listen();
