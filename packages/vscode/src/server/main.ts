/**
 * The sdoc language server.
 *
 * Serves language id 'sdoc'. For every open .sdoc document it maintains a
 * line-preserving virtual Svelte projection at a sibling `<file>.svelte`
 * path inside the embedded svelte-language-server, forwards editor requests
 * with identity position mapping, and republishes the embedded server's
 * diagnostics filtered down to authored, verbatim lines. Formatting is
 * fragment-wise prettier (Svelte bodies via prettier-plugin-svelte, DOC
 * bodies via the markdown parser); block openers re-indent and wrap at the
 * project's printWidth but their attributes are never rewritten.
 */

import {
	createConnection,
	TextDocuments,
	TextDocumentSyncKind,
	ProposedFeatures,
	type Connection,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'node:url';
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
import {
	scanSdoc,
	projectSdoc,
	projectSdocBlocks,
	type SdocProjection,
	type SdocBlockProjection,
} from 'sdocs/language';
import { startEmbeddedSvelte, type EmbeddedSvelte } from './embeddedSvelte';
import { formatSdoc } from './formatting';
import { sdocTagHover } from './tagHover';

const connection: Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface Tracked {
	/** The base projection: file script/style + every block as a snippet. */
	projection: SdocProjection;
	/** Per-block projections for blocks with their own <script>/<style>. */
	blocks: SdocBlockProjection[];
	/** Per authored line: index into `blocks` that owns it, or -1 for the
	 * base projection. Exactly one virtual doc speaks for every line. */
	owner: number[];
	version: number;
	/** Latest diagnostics per virtual URI, merged into one publish. */
	diags: Map<string, Diagnostic[]>;
	/** Block virtual URIs currently open in the embedded server. */
	openBlockUris: Set<string>;
}

const tracked = new Map<string, Tracked>();
let svelte: Promise<EmbeddedSvelte> | null = null;
let workspaceUri: string | null = null;

function virtualUri(sdocUri: string): string {
	return sdocUri + '.svelte';
}

function blockVirtualUri(sdocUri: string, key: string): string {
	return `${sdocUri}.__sdocs_${key}.svelte`;
}

const VIRTUAL_SUFFIX_RE = /(\.__sdocs_[\w-]+)?\.svelte$/;

function sdocUriOf(virtual: string): string {
	return virtual.replace(VIRTUAL_SUFFIX_RE, '');
}

/** The projection a virtual URI carries: the base one or a block's. */
function projectionOf(entry: Tracked, virtual: string): SdocProjection | null {
	const m = virtual.match(/\.__sdocs_([\w-]+)\.svelte$/);
	if (!m) return entry.projection;
	return entry.blocks.find((b) => b.key === m[1]) ?? null;
}

/** Merge the per-virtual-doc diagnostics: each authored line is owned by
 * exactly one projection (a block's, or the base), and only the owner's
 * verbatim-line diagnostics surface. */
function publishMerged(sdocUri: string, entry: Tracked): void {
	const kept: Diagnostic[] = [];
	for (const [uri, diags] of entry.diags) {
		const projection = projectionOf(entry, uri);
		if (!projection) continue;
		const blockKey = uri.match(/\.__sdocs_([\w-]+)\.svelte$/)?.[1] ?? null;
		const ownerIdx = blockKey === null ? -1 : entry.blocks.findIndex((b) => b.key === blockKey);
		for (const d of diags) {
			const line = d.range.start.line;
			if (line >= projection.sourceLineCount) continue;
			if (projection.lineKinds[line] !== 'verbatim') continue;
			if ((entry.owner[line] ?? -1) !== ownerIdx) continue;
			kept.push(d);
		}
	}
	void connection.sendDiagnostics({ uri: sdocUri, diagnostics: kept });
}

function getSvelte(): Promise<EmbeddedSvelte> {
	svelte ??= startEmbeddedSvelte(workspaceUri, (params) => {
		const sdocUri = sdocUriOf(params.uri);
		const entry = tracked.get(sdocUri);
		if (!entry) return;
		entry.diags.set(params.uri, params.diagnostics);
		publishMerged(sdocUri, entry);
	});
	return svelte;
}

async function syncDocument(doc: TextDocument): Promise<Tracked> {
	const server = await getSvelte();
	const file = scanSdoc(doc.getText());
	const projection = projectSdoc(file);
	const blocks = projectSdocBlocks(file);
	const owner: number[] = new Array(projection.sourceLineCount).fill(-1);
	blocks.forEach((b, i) => {
		for (let l = b.firstLine; l <= b.lastLine; l++) owner[l] = i;
	});
	const existing = tracked.get(doc.uri);
	const entry: Tracked = {
		projection,
		blocks,
		owner,
		version: (existing?.version ?? 0) + 1,
		diags: existing?.diags ?? new Map(),
		openBlockUris: existing?.openBlockUris ?? new Set(),
	};
	tracked.set(doc.uri, entry);

	const syncOne = async (uri: string, text: string, isOpen: boolean) => {
		if (isOpen) {
			await server.sendNotification(DidChangeTextDocumentNotification.type, {
				textDocument: { uri, version: entry.version },
				contentChanges: [{ text }],
			});
		} else {
			await server.sendNotification(DidOpenTextDocumentNotification.type, {
				textDocument: { uri, languageId: 'svelte', version: entry.version, text },
			});
		}
	};

	await syncOne(virtualUri(doc.uri), projection.text, !!existing);

	const wanted = new Map(blocks.map((b) => [blockVirtualUri(doc.uri, b.key), b] as const));
	// Close block docs whose block lost its script/style (or vanished).
	for (const uri of [...entry.openBlockUris]) {
		if (!wanted.has(uri)) {
			entry.openBlockUris.delete(uri);
			entry.diags.delete(uri);
			await server.sendNotification(DidCloseTextDocumentNotification.type, {
				textDocument: { uri },
			});
		}
	}
	for (const [uri, block] of wanted) {
		const isOpen = entry.openBlockUris.has(uri);
		entry.openBlockUris.add(uri);
		await syncOne(uri, block.text, isOpen);
	}
	return entry;
}

connection.onInitialize(async (params) => {
	workspaceUri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? null;
	// Start the embedded Svelte server now so we can advertise exactly the
	// trigger characters it answers — advertising one it ignores (e.g. space)
	// makes VS Code cache an empty result and show "No suggestions".
	const svelte = await getSvelte();
	const completion = svelte.capabilities.completionProvider;
	const signature = svelte.capabilities.signatureHelpProvider;
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: completion?.triggerCharacters,
			},
			hoverProvider: true,
			definitionProvider: true,
			signatureHelpProvider: {
				triggerCharacters: signature?.triggerCharacters ?? ['(', ',', '<'],
			},
			documentFormattingProvider: true,
		},
	};
});

/** Syncs and closes are serialized per document URI: interleaved runs share
 * openBlockUris, so a stale sync resuming mid-flight could close or reopen a
 * block virtual doc against a newer tracked state. */
const syncQueues = new Map<string, Promise<void>>();

function enqueue(uri: string, task: () => Promise<unknown>): void {
	const prev = syncQueues.get(uri) ?? Promise.resolve();
	const next = prev.then(task).then(
		() => undefined,
		(err) => connection.console.error(`sdocs: sync failed for ${uri}: ${err}`),
	);
	syncQueues.set(uri, next);
}

documents.onDidChangeContent((change) => {
	enqueue(change.document.uri, () => syncDocument(change.document));
});

documents.onDidClose((event) => {
	enqueue(event.document.uri, async () => {
		const entry = tracked.get(event.document.uri);
		tracked.delete(event.document.uri);
		void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
		const server = await getSvelte();
		await server.sendNotification(DidCloseTextDocumentNotification.type, {
			textDocument: { uri: virtualUri(event.document.uri) },
		});
		for (const uri of entry?.openBlockUris ?? []) {
			await server.sendNotification(DidCloseTextDocumentNotification.type, {
				textDocument: { uri },
			});
		}
	});
});

/** The virtual doc that owns a given authored line: a block's own projection
 * for lines inside a script/style-bearing block, the base one elsewhere. */
function owningUri(sdocUri: string, line: number): string {
	const entry = tracked.get(sdocUri);
	if (!entry) return virtualUri(sdocUri);
	const idx = entry.owner[line] ?? -1;
	return idx === -1 ? virtualUri(sdocUri) : blockVirtualUri(sdocUri, entry.blocks[idx].key);
}

/** Positions map 1:1; only the document URI needs translation — to the
 * virtual doc owning the request's line. */
function forwardParams<T extends { textDocument: { uri: string }; position?: { line: number } }>(
	params: T,
): T {
	const uri = params.position
		? owningUri(params.textDocument.uri, params.position.line)
		: virtualUri(params.textDocument.uri);
	return { ...params, textDocument: { ...params.textDocument, uri } };
}

/**
 * Only verbatim-projected lines carry authored Svelte the embedded server
 * can speak about. Block tags project to `{#snippet}` wrappers — answering
 * there would describe the wrapper (snippet docs on a `[DOC …]` line), so
 * position-based requests on generated lines are answered locally with null.
 * Verbatim-ness is judged by the projection owning the line.
 */
function isVerbatimLine(uri: string, line: number): boolean {
	const entry = tracked.get(uri);
	if (!entry) return false;
	const idx = entry.owner[line] ?? -1;
	const projection = idx === -1 ? entry.projection : entry.blocks[idx];
	return line < projection.sourceLineCount && projection.lineKinds[line] === 'verbatim';
}

const VIRTUAL_LOCATION_RE = /\.sdoc(\.__sdocs_[\w-]+)?\.svelte$/;

/** Map any location pointing into a virtual document back to its .sdoc file. */
function mapLocations<T extends Location | LocationLink>(result: T[] | null): T[] | null {
	if (!result) return result;
	return result.map((loc) => {
		if ('uri' in loc && VIRTUAL_LOCATION_RE.test(loc.uri)) {
			return { ...loc, uri: sdocUriOf(loc.uri) };
		}
		if ('targetUri' in loc && VIRTUAL_LOCATION_RE.test(loc.targetUri)) {
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
	if (!isVerbatimLine(params.textDocument.uri, params.position.line)) {
		// Block tag lines get the sdoc language's own docs; other generated
		// lines have nothing to say.
		const doc = documents.get(params.textDocument.uri);
		return doc ? sdocTagHover(doc.getText(), params.position) : null;
	}
	const server = await getSvelte();
	return server.sendRequest(HoverRequest.type, forwardParams(params));
});

connection.onDefinition(async (params) => {
	if (!isVerbatimLine(params.textDocument.uri, params.position.line)) return null;
	const server = await getSvelte();
	const result = await server.sendRequest(DefinitionRequest.type, forwardParams(params));
	if (Array.isArray(result)) return mapLocations(result as Location[]);
	if (result && 'uri' in result) return mapLocations([result])![0];
	return result;
});

connection.onSignatureHelp(async (params) => {
	if (!isVerbatimLine(params.textDocument.uri, params.position.line)) return null;
	const server = await getSvelte();
	return server.sendRequest(SignatureHelpRequest.type, forwardParams(params));
});

connection.onDocumentFormatting(async (params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const source = doc.getText();
	// Pass the fs path so the formatter can resolve the project's .prettierrc.
	const filePath = params.textDocument.uri.startsWith('file:')
		? fileURLToPath(params.textDocument.uri)
		: undefined;
	const formatted = await formatSdoc(source, params.options, undefined, filePath);
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
