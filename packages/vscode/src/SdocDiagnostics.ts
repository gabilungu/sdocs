import * as vscode from 'vscode';
import { findMetaObject, importedIdentifiers, topLevelSnippets } from './sdocSource';

const DEBOUNCE_MS = 400;

/** sdocs-specific lint for .sdoc files — complements (never repeats) the Svelte LS. */
export class SdocDiagnostics implements vscode.Disposable {
	private collection = vscode.languages.createDiagnosticCollection('sdocs');
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private disposables: vscode.Disposable[] = [];

	constructor() {
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => this.schedule(doc)),
			vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document)),
			vscode.workspace.onDidCloseTextDocument((doc) => {
				this.collection.delete(doc.uri);
				this.clearTimer(doc.uri);
			}),
		);
		for (const editor of vscode.window.visibleTextEditors) this.schedule(editor.document);
	}

	private isSdoc(doc: vscode.TextDocument): boolean {
		return doc.languageId === 'svelte' && doc.fileName.endsWith('.sdoc');
	}

	private clearTimer(uri: vscode.Uri) {
		const key = uri.toString();
		const timer = this.timers.get(key);
		if (timer) clearTimeout(timer);
		this.timers.delete(key);
	}

	private schedule(doc: vscode.TextDocument) {
		if (!this.isSdoc(doc)) return;
		this.clearTimer(doc.uri);
		this.timers.set(
			doc.uri.toString(),
			setTimeout(() => this.refresh(doc), DEBOUNCE_MS),
		);
	}

	private refresh(doc: vscode.TextDocument) {
		this.timers.delete(doc.uri.toString());
		const text = doc.getText();
		const diagnostics: vscode.Diagnostic[] = [];
		const isComponentDoc =
			!doc.fileName.endsWith('.page.sdoc') && !doc.fileName.endsWith('.layout.sdoc');

		const meta = findMetaObject(text);
		if (!meta) {
			diagnostics.push(
				new vscode.Diagnostic(
					new vscode.Range(0, 0, 0, Math.max(1, doc.lineAt(0).text.length)),
					"sdocs: no `export const meta = { ... }` found — add one with at least a `title`.",
					vscode.DiagnosticSeverity.Warning,
				),
			);
		} else {
			// title is the one required meta field.
			if (!/^[ \t]*title\s*:/m.test(meta.topLevel)) {
				diagnostics.push(
					new vscode.Diagnostic(
						rangeAt(doc, meta.declStart, 'export const meta'.length),
						'sdocs: `meta.title` is required — it names the doc and places it in the sidebar.',
						vscode.DiagnosticSeverity.Warning,
					),
				);
			}

			// component: must reference an identifier that exists in the file
			// (string paths are also valid and skipped — they're masked out).
			if (isComponentDoc) {
				const component = /(^|[{,\n])\s*component\s*:\s*([A-Za-z_$][\w$]*)/.exec(meta.topLevel);
				if (component) {
					const name = component[2];
					const declared =
						importedIdentifiers(text).has(name) ||
						new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`).test(text);
					if (!declared) {
						const nameOffset =
							meta.braceOpen + component.index + component[0].length - name.length;
						diagnostics.push(
							new vscode.Diagnostic(
								rangeAt(doc, nameOffset, name.length),
								`sdocs: \`${name}\` is not imported or declared in this file.`,
								vscode.DiagnosticSeverity.Warning,
							),
						);
					}
				}
			}
		}

		// Duplicate top-level snippet names collide as sdocs sub-pages.
		const seen = new Map<string, number>();
		for (const snippet of topLevelSnippets(text)) {
			const count = seen.get(snippet.name) ?? 0;
			seen.set(snippet.name, count + 1);
			if (count > 0) {
				diagnostics.push(
					new vscode.Diagnostic(
						rangeAt(doc, snippet.nameOffset, snippet.name.length),
						`sdocs: duplicate snippet name \`${snippet.name}\` — snippet sub-pages need unique names.`,
						vscode.DiagnosticSeverity.Warning,
					),
				);
			}
		}

		this.collection.set(doc.uri, diagnostics);
	}

	dispose() {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		this.collection.dispose();
		for (const disposable of this.disposables) disposable.dispose();
	}
}

function rangeAt(doc: vscode.TextDocument, offset: number, length: number): vscode.Range {
	return new vscode.Range(doc.positionAt(offset), doc.positionAt(offset + length));
}
