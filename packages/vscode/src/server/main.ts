/**
 * The sdoc language server.
 *
 * Serves language id 'sdoc'. For every open .sdoc document it maintains a
 * line-preserving virtual Svelte projection at a sibling `<file>.svelte`
 * path inside the embedded svelte-language-server, forwards editor requests
 * with identity position mapping, and republishes the embedded server's
 * diagnostics filtered down to authored text: verbatim lines, plus the
 * content spans of recomposed tag lines (single-line scripts). Formatting is
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
	DocumentDiagnosticRequest,
	CancellationTokenSource,
	type DocumentDiagnosticReport,
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

// No background failure inside the embedded services may ever hard-kill the
// LSP: the embedded svelte-language-server's fallback file watcher emits
// unhandled FSWatcher errors for unreadable mounts (e.g. EBUSY on a raw
// /dev/diskN), which would exit the process — in VS Code that's a crash loop
// and zero language features. Log and keep serving instead.
process.on('uncaughtException', (err) => {
	connection.console.error(`sdocs: uncaught exception: ${err?.stack ?? String(err)}`);
});
process.on('unhandledRejection', (reason) => {
	connection.console.error(`sdocs: unhandled rejection: ${String(reason)}`);
});

interface Tracked {
	/** The base projection: file script/style + every block as a snippet. */
	projection: SdocProjection;
	/** Per-block projections for blocks with their own <script>/<style>. */
	blocks: SdocBlockProjection[];
	/** Per authored line: index into `blocks` that owns it, or -1 for the
	 * base projection. Exactly one virtual doc speaks for every line. */
	owner: number[];
	version: number;
	/** The authored document's client version this sync derives from —
	 * stamped onto outgoing publishes. */
	docVersion: number;
	/** Latest diagnostics per virtual URI, stamped with the sync `version`
	 * their content was derived from; only current-version sets merge. */
	diags: Map<string, { version: number; items: Diagnostic[] }>;
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
 * diagnostics on authored text surface — whole verbatim lines, plus the
 * recorded content span of 'recomposed' lines (single-line scripts, content
 * sharing a tag's opener/closer line), where diagnostics are clamped to the
 * span so generated tag text never gets highlighted. Sets derived from a
 * superseded sync are withheld — filtering old-version coordinates through
 * the new projection would publish shifted lines and leaked wrapper hints. */
function publishMerged(sdocUri: string, entry: Tracked): void {
	const kept: Diagnostic[] = [];
	for (const [uri, stored] of entry.diags) {
		if (stored.version !== entry.version) continue;
		const projection = projectionOf(entry, uri);
		if (!projection) continue;
		const blockKey = uri.match(/\.__sdocs_([\w-]+)\.svelte$/)?.[1] ?? null;
		const ownerIdx = blockKey === null ? -1 : entry.blocks.findIndex((b) => b.key === blockKey);
		for (const d of stored.items) {
			const line = d.range.start.line;
			if (line >= projection.sourceLineCount) continue;
			if ((entry.owner[line] ?? -1) !== ownerIdx) continue;
			const kind = projection.lineKinds[line];
			if (kind === 'verbatim') {
				kept.push(d);
				continue;
			}
			if (kind !== 'recomposed') continue;
			const span = projection.contentSpans?.[line];
			if (!span) continue;
			const startCh = d.range.start.character;
			const endsSameLine = d.range.end.line === line;
			if (startCh >= span.end) continue;
			if (endsSameLine && d.range.end.character <= span.start) continue;
			kept.push({
				...d,
				range: {
					start: { line, character: Math.max(startCh, span.start) },
					end: endsSameLine
						? { line, character: Math.min(d.range.end.character, span.end) }
						: d.range.end,
				},
			});
		}
	}
	void connection.sendDiagnostics({ uri: sdocUri, version: entry.docVersion, diagnostics: kept });
}

/** In-flight diagnostic pulls per authored doc; a new round cancels the last. */
const pullTokens = new Map<string, CancellationTokenSource>();

/** Pull diagnostics for every virtual doc of `sdocUri` as synced at
 * `entry.version`. Each response correlates to that exact version: results
 * arriving after a newer sync are dropped, and one merged publish goes out
 * only when the whole round is still current — stale coordinates never
 * surface, and the client keeps the previous publish until fresh data lands. */
async function pullDiagnostics(sdocUri: string, entry: Tracked): Promise<void> {
	const server = await getSvelte();
	const version = entry.version;
	pullTokens.get(sdocUri)?.cancel();
	const tokens = new CancellationTokenSource();
	pullTokens.set(sdocUri, tokens);
	const uris = [virtualUri(sdocUri), ...entry.blocks.map((b) => blockVirtualUri(sdocUri, b.key))];
	await Promise.all(
		uris.map(async (uri) => {
			let report: DocumentDiagnosticReport | null = null;
			try {
				report = await server.sendRequest(
					DocumentDiagnosticRequest.type,
					{ textDocument: { uri } },
					tokens.token,
				);
			} catch {
				return; // cancelled or failed — a newer round supersedes this one
			}
			const current = tracked.get(sdocUri);
			if (!current || current.version !== version || !report) return;
			if (report.kind === 'full') {
				current.diags.set(uri, { version, items: report.items });
			} else {
				// 'unchanged' (theoretical — no previousResultId is ever sent):
				// the stored items still hold, re-stamp them as current.
				const prev = current.diags.get(uri);
				if (prev) current.diags.set(uri, { version, items: prev.items });
			}
		}),
	);
	const current = tracked.get(sdocUri);
	if (current && current.version === version) publishMerged(sdocUri, current);
}

function getSvelte(): Promise<EmbeddedSvelte> {
	svelte ??= startEmbeddedSvelte(
		workspaceUri,
		// Push publishes only carry out-of-band reports in pull mode (e.g.
		// tsconfig errors); anything targeting a tracked virtual doc merges
		// stamped at the current version.
		(params) => {
			const sdocUri = sdocUriOf(params.uri);
			const entry = tracked.get(sdocUri);
			if (!entry) return;
			entry.diags.set(params.uri, { version: entry.version, items: params.diagnostics });
			publishMerged(sdocUri, entry);
		},
		// Project reload (tsconfig change etc.): re-pull everything.
		() => {
			for (const [uri, entry] of tracked) void pullDiagnostics(uri, entry);
		},
	);
	return svelte;
}

/** A sane workspace root when VS Code opened a lone file (no folder): the
 * document's own directory. Forwarding a null root would make the embedded
 * server's fallback watcher watch the filesystem root, where an unreadable
 * mount (EBUSY on /dev/diskN) kills the process — a crash loop in
 * single-file windows. */
function deriveRoot(docUri: string): string | null {
	const slash = docUri.lastIndexOf('/');
	if (!docUri.startsWith('file://') || slash <= 'file://'.length) return null;
	return docUri.slice(0, slash);
}

async function syncDocument(doc: TextDocument): Promise<Tracked> {
	// The embedded server's start was deferred when the editor had no
	// workspace folder; the first document supplies the root.
	if (workspaceUri === null) workspaceUri = deriveRoot(doc.uri);
	const server = await getSvelte();
	const file = scanSdoc(doc.getText());
	const projection = projectSdoc(file);
	const blocks = projectSdocBlocks(file);
	const owner: number[] = new Array(projection.sourceLineCount).fill(-1);
	blocks.forEach((b, i) => {
		for (let l = b.firstLine; l <= b.lastLine; l++) owner[l] = i;
		for (const l of b.extraOwnedLines ?? []) owner[l] = i;
	});
	const existing = tracked.get(doc.uri);
	const entry: Tracked = {
		projection,
		blocks,
		owner,
		version: (existing?.version ?? 0) + 1,
		docVersion: doc.version,
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
	// Pull this sync's diagnostics round; fire-and-forget so the per-document
	// sync queue never waits on diagnostic computation.
	void pullDiagnostics(doc.uri, entry);
	return entry;
}

/** What the bundled svelte-language-server advertises, mirrored for the
 * deferred-start case (single-file window). Deliberately no space —
 * advertising a trigger the embedded server ignores makes VS Code cache an
 * empty result and show "No suggestions". */
const FALLBACK_COMPLETION_TRIGGERS = '. " \' ` / @ < > * # $ + ^ ( [ - : |'.split(' ');

connection.onInitialize(async (params) => {
	workspaceUri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? null;
	// Start the embedded Svelte server now so we can advertise exactly the
	// trigger characters it answers. With no workspace folder at all
	// (single-file window) the start is DEFERRED to the first opened
	// document, whose directory becomes the root — forwarding a null root
	// makes the embedded server watch the filesystem root and die on the
	// first unreadable mount.
	let completionTriggers: string[] | undefined = FALLBACK_COMPLETION_TRIGGERS;
	let signatureTriggers = ['(', ',', '<'];
	if (workspaceUri !== null) {
		const svelte = await getSvelte();
		completionTriggers = svelte.capabilities.completionProvider?.triggerCharacters;
		signatureTriggers = svelte.capabilities.signatureHelpProvider?.triggerCharacters ?? signatureTriggers;
	}
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: completionTriggers,
			},
			hoverProvider: true,
			definitionProvider: true,
			signatureHelpProvider: {
				triggerCharacters: signatureTriggers,
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
		pullTokens.get(event.document.uri)?.cancel();
		pullTokens.delete(event.document.uri);
		void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
		if (!svelte) return; // embedded server never started: nothing to close
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

/** Whether a projection speaks for authored text at a position: whole
 * verbatim lines, and the recorded content span of 'recomposed' lines
 * (single-line scripts, content sharing a tag's opener/closer line), where
 * positions map 1:1. The span end is inclusive when `edge` is 'inclusive' —
 * a cursor sitting right after the last content character (typing against
 * the recomposed `</script>`) is still authoring content — and exclusive for
 * targets, whose start must land ON authored text. */
function speaksForPosition(
	projection: SdocProjection,
	position: { line: number; character: number },
	edge: 'inclusive' | 'exclusive',
): boolean {
	if (position.line >= projection.sourceLineCount) return false;
	const kind = projection.lineKinds[position.line];
	if (kind === 'verbatim') return true;
	if (kind !== 'recomposed') return false;
	const span = projection.contentSpans?.[position.line];
	if (!span || position.character < span.start) return false;
	return edge === 'inclusive' ? position.character <= span.end : position.character < span.end;
}

/**
 * Only positions on authored Svelte can be forwarded: verbatim-projected
 * lines, plus the content span of 'recomposed' lines. Block tags project to
 * `{#snippet}` wrappers — answering there would describe the wrapper
 * (snippet docs on a `[DOC …]` line) — and the emitted tag text around a
 * recomposed span is equally generated, so position-based requests outside
 * authored text are answered locally with null. Judged by the projection
 * owning the line.
 */
function isAuthoredPosition(uri: string, position: { line: number; character: number }): boolean {
	const entry = tracked.get(uri);
	if (!entry) return false;
	const idx = entry.owner[position.line] ?? -1;
	const projection = idx === -1 ? entry.projection : entry.blocks[idx];
	return speaksForPosition(projection, position, 'inclusive');
}

const VIRTUAL_LOCATION_RE = /\.sdoc(\.__sdocs_[\w-]+)?\.svelte$/;

/** Whether a position of a virtual document is verbatim authored text (or
 * sits inside a recomposed line's content span) in its owning projection —
 * i.e. its coordinates are meaningful in the .sdoc file. */
function isAuthoredTarget(
	virtual: string,
	position: { line: number; character: number },
): boolean {
	const entry = tracked.get(sdocUriOf(virtual));
	if (!entry) return false;
	const projection = projectionOf(entry, virtual);
	if (!projection) return false;
	return speaksForPosition(projection, position, 'exclusive');
}

/** Map locations pointing into a virtual document back to the .sdoc file.
 * Targets on generated (wrapper) lines — or inside the generated tag text
 * around a recomposed content span — are DROPPED: their ranges are virtual
 * coordinates with no authored counterpart, so rewriting only the URI would
 * highlight unrelated authored text (fewer results beat garbage). */
function mapLocations<T extends Location | LocationLink>(result: T[] | null): T[] | null {
	if (!result) return result;
	const mapped: T[] = [];
	for (const loc of result) {
		if ('uri' in loc) {
			if (!VIRTUAL_LOCATION_RE.test(loc.uri)) {
				mapped.push(loc);
			} else if (isAuthoredTarget(loc.uri, loc.range.start)) {
				mapped.push({ ...loc, uri: sdocUriOf(loc.uri) });
			}
		} else if (!VIRTUAL_LOCATION_RE.test(loc.targetUri)) {
			mapped.push(loc);
		} else if (
			isAuthoredTarget(loc.targetUri, loc.targetRange.start) &&
			isAuthoredTarget(loc.targetUri, loc.targetSelectionRange.start)
		) {
			mapped.push({ ...loc, targetUri: sdocUriOf(loc.targetUri) });
		}
	}
	return mapped;
}

connection.onCompletion(async (params) => {
	// Generated (wrapper) lines take the same gate as hover/definition: a
	// forwarded completion there describes the {#snippet} wrapper, and an
	// accepted item's textEdit would REPLACE authored opener text.
	if (!isAuthoredPosition(params.textDocument.uri, params.position)) return null;
	const server = await getSvelte();
	return server.sendRequest(CompletionRequest.type, forwardParams(params));
});

connection.onCompletionResolve(async (item) => {
	if (!svelte) return item;
	const server = await getSvelte();
	return server.sendRequest(CompletionResolveRequest.type, item);
});

connection.onHover(async (params) => {
	if (!isAuthoredPosition(params.textDocument.uri, params.position)) {
		// Block tag lines get the sdoc language's own docs; other generated
		// lines have nothing to say.
		const doc = documents.get(params.textDocument.uri);
		return doc ? sdocTagHover(doc.getText(), params.position) : null;
	}
	const server = await getSvelte();
	return server.sendRequest(HoverRequest.type, forwardParams(params));
});

connection.onDefinition(async (params) => {
	if (!isAuthoredPosition(params.textDocument.uri, params.position)) return null;
	const server = await getSvelte();
	const result = await server.sendRequest(DefinitionRequest.type, forwardParams(params));
	if (Array.isArray(result)) return mapLocations(result as Location[]);
	if (result && 'uri' in result) return mapLocations([result])?.[0] ?? null;
	return result;
});

connection.onSignatureHelp(async (params) => {
	if (!isAuthoredPosition(params.textDocument.uri, params.position)) return null;
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
