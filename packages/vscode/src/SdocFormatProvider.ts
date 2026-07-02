import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';

const SVELTE_EXTENSION_ID = 'svelte.svelte-vscode';
const SCRATCH_SUBDIR = path.join('.cache', 'sdocs-format');
const SCRATCH_FILE_RE = /^scratch-(\d+)\.svelte$/;

/** How long to keep retrying while the Svelte language server is still starting. */
const COLD_START_TIMEOUT_MS = 8000;
const RETRY_INTERVAL_MS = 250;

/**
 * Formats `.sdoc` files by delegating to whatever Svelte formatter the user has
 * installed (`svelte.svelte-vscode`, a hard `extensionDependency`).
 *
 * A `.sdoc` file is structurally a Svelte component — an instance `<script>`
 * plus markup made of top-level `{#snippet}` blocks — so we mirror its text into
 * a hidden Svelte "scratch" document, ask VS Code to run the Svelte formatter on
 * it, and return the resulting edits. The scratch is kept byte-for-byte
 * identical to the `.sdoc` document at format time, so the edit ranges line up
 * 1:1 and need no remapping.
 *
 * WHERE the scratch lives is critical. prettier-plugin-svelte (which the Svelte
 * formatter uses) resolves the Svelte *compiler* relative to the file being
 * formatted. `{#snippet}` is Svelte 5 syntax; if the scratch sits outside any
 * project, the formatter falls back to the Svelte extension's bundled Svelte 4,
 * which can't parse snippets — yielding a parse error and zero edits. So the
 * scratch is placed in the nearest `node_modules/.cache/sdocs-format/` above the
 * document, where the project's Svelte 5 resolves. `node_modules` is also
 * gitignored and ignored by file watchers (Vite/chokidar), so the scratch
 * causes no git noise and no HMR churn. (Verified: the Svelte LS still formats a
 * file located inside `node_modules`.)
 *
 * Why a real file on disk rather than an in-memory (untitled) document: the
 * Svelte language server only serves `file`-scheme documents.
 *
 * The scratch filename is tagged with this extension host's process id, so
 * multiple open windows never share a file. `dispose()` deletes our files on a
 * clean shutdown; `sweepStale()` reclaims files left by a crashed session (one
 * whose pid is no longer running) the next time we touch that directory.
 *
 * Delegating — instead of bundling prettier-plugin-svelte — means this extension
 * ships no copy of the Svelte compiler/formatter; it follows the user's Svelte
 * extension as the language evolves.
 */
export class SdocFormatProvider
	implements vscode.DocumentFormattingEditProvider, vscode.Disposable
{
	/** scratch directory (fsPath) -> the open scratch document reused for it. */
	private readonly scratches = new Map<string, vscode.TextDocument>();
	private queue: Promise<unknown> = Promise.resolve();
	private serverWarm = false;
	private warmed = false;

	constructor(
		private readonly output: vscode.OutputChannel,
		/** Used only when a document isn't inside any project (no node_modules). */
		private readonly fallbackDir: vscode.Uri,
	) {}

	provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken,
	): Promise<vscode.TextEdit[]> {
		// Serialize jobs so concurrent saves don't clobber a shared scratch doc.
		const result = this.queue.then(
			() => this.format(document, options, token),
			() => this.format(document, options, token),
		);
		this.queue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	/**
	 * Prime the Svelte language server (once) using `document`, so the user's
	 * first real format isn't a dud while the server is still booting. Runs a
	 * throwaway format on the scratch in the background and discards the result;
	 * fire-and-forget, serialized with real formats via the same queue.
	 */
	warmUp(document: vscode.TextDocument): void {
		if (this.warmed) return;
		this.warmed = true;
		const job = this.queue.then(
			() => this.runWarmUp(document),
			() => this.runWarmUp(document),
		);
		this.queue = job.then(
			() => undefined,
			() => undefined,
		);
	}

	private async runWarmUp(document: vscode.TextDocument): Promise<void> {
		try {
			await this.ensureSvelteExtension();
			const scratch = await this.getScratch(document);
			const cts = new vscode.CancellationTokenSource();
			try {
				const edits = await this.delegate(
					scratch.uri,
					{ tabSize: 4, insertSpaces: false },
					cts.token,
				);
				if (edits && edits.length > 0) this.serverWarm = true;
			} finally {
				cts.dispose();
			}
		} catch {
			// Best-effort: a real format will still retry on cold start.
		}
	}

	private async format(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken,
	): Promise<vscode.TextEdit[]> {
		try {
			await this.ensureSvelteExtension();
			if (token.isCancellationRequested) return [];

			const scratch = await this.getScratch(document);
			if (token.isCancellationRequested) return [];

			const edits = await this.delegate(scratch.uri, options, token);
			if (!edits || edits.length === 0) {
				if (!this.serverWarm) {
					this.output.appendLine(
						`No edits returned for ${document.uri.fsPath}. The Svelte language ` +
							'server may still be starting, or the document has a syntax error.',
					);
				}
				return [];
			}
			this.serverWarm = true;
			return edits;
		} catch (err) {
			this.output.appendLine(
				`Formatting failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
			);
			return [];
		}
	}

	/** Make sure the Svelte extension — and therefore its formatter — is active. */
	private async ensureSvelteExtension(): Promise<void> {
		const ext = vscode.extensions.getExtension(SVELTE_EXTENSION_ID);
		if (!ext) {
			throw new Error(
				`${SVELTE_EXTENSION_ID} is not installed. It is required for .sdoc formatting.`,
			);
		}
		if (!ext.isActive) await ext.activate();
	}

	/**
	 * Get (creating/reusing) the hidden scratch Svelte document for `document`,
	 * with its text synced to the document's current content.
	 */
	private async getScratch(document: vscode.TextDocument): Promise<vscode.TextDocument> {
		const dir = await this.scratchDirFor(document.uri.fsPath);
		const file = path.join(dir, `scratch-${process.pid}.svelte`);
		const text = document.getText();

		const existing = this.scratches.get(dir);
		if (existing && !existing.isClosed) {
			if (existing.getText() === text) return existing;
			// The language server formats the in-memory buffer, so an edit suffices.
			const fullRange = new vscode.Range(
				existing.positionAt(0),
				existing.positionAt(existing.getText().length),
			);
			const edit = new vscode.WorkspaceEdit();
			edit.replace(existing.uri, fullRange, text);
			if (await vscode.workspace.applyEdit(edit)) return existing;
			// else fall through and reopen fresh
		}

		const doc = await this.openScratch(dir, file, text);
		this.scratches.set(dir, doc);
		return doc;
	}

	/**
	 * The directory the scratch should live in: the nearest `node_modules` above
	 * the document (so the project's Svelte 5 resolves), under `.cache/`. Falls
	 * back to `fallbackDir` when the document isn't inside any project.
	 */
	private async scratchDirFor(docFsPath: string): Promise<string> {
		let dir = path.dirname(docFsPath);
		for (;;) {
			if (await exists(path.join(dir, 'node_modules'))) {
				return path.join(dir, 'node_modules', SCRATCH_SUBDIR);
			}
			const parent = path.dirname(dir);
			if (parent === dir) break; // reached filesystem root
			dir = parent;
		}
		this.output.appendLine(
			`No node_modules found above ${docFsPath}; using a fallback scratch dir. ` +
				'Svelte 5 syntax (e.g. {#snippet}) may not format outside a project.',
		);
		return this.fallbackDir.fsPath;
	}

	/** Write the scratch file and open it as a Svelte document. */
	private async openScratch(dir: string, file: string, text: string): Promise<vscode.TextDocument> {
		await fs.mkdir(dir, { recursive: true });
		await this.sweepStale(dir);
		await fs.writeFile(file, text, 'utf8');
		let doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
		// Force the language: a file under node_modules may otherwise be detected
		// as something else (e.g. html), which routes formatting to the wrong
		// formatter and mangles the markup.
		if (doc.languageId !== 'svelte') {
			doc = await vscode.languages.setTextDocumentLanguage(doc, 'svelte');
		}
		return doc;
	}

	/**
	 * Run the registered (Svelte) document formatter on the scratch URI. On a
	 * cold start the server may not have registered its formatter yet, so retry
	 * for a bounded window. Once we have seen it respond, a single attempt is
	 * enough — an empty result then simply means "no changes" or a syntax error.
	 */
	private async delegate(
		uri: vscode.Uri,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken,
	): Promise<vscode.TextEdit[] | undefined> {
		const deadline = this.serverWarm ? 0 : COLD_START_TIMEOUT_MS;
		let elapsed = 0;
		for (;;) {
			if (token.isCancellationRequested) return undefined;
			const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
				'vscode.executeFormatDocumentProvider',
				uri,
				options,
			);
			if ((edits && edits.length > 0) || elapsed >= deadline) return edits;
			await delay(RETRY_INTERVAL_MS);
			elapsed += RETRY_INTERVAL_MS;
		}
	}

	/**
	 * Delete scratch files in `dir` left by sessions that crashed before
	 * `dispose()` could run. A file is removed only when no live process owns its
	 * pid, so files belonging to other open windows are never disturbed.
	 */
	private async sweepStale(dir: string): Promise<void> {
		let entries: string[];
		try {
			entries = await fs.readdir(dir);
		} catch {
			return;
		}
		await Promise.all(
			entries.map(async (name) => {
				const match = SCRATCH_FILE_RE.exec(name);
				if (!match) return;
				const pid = Number(match[1]);
				if (pid === process.pid || isProcessAlive(pid)) return;
				try {
					await fs.rm(path.join(dir, name), { force: true });
				} catch (err) {
					this.output.appendLine(`Could not remove stale scratch ${name}: ${String(err)}`);
				}
			}),
		);
	}

	dispose(): void {
		for (const doc of this.scratches.values()) {
			void fs.rm(doc.uri.fsPath, { force: true }).catch(() => undefined);
		}
		this.scratches.clear();
	}
}

/** Whether a path exists. */
async function exists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

/** Whether a process with `pid` is currently running. */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0); // signal 0 = existence/permission check, kills nothing
		return true;
	} catch (err) {
		// EPERM means the process exists but we may not signal it — still alive.
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
