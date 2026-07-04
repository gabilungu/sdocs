import * as vscode from 'vscode';
import { parseSdoc, scanSdoc } from 'sdocs/language';
import { importedIdentifiers } from './sdocSource';

const DEBOUNCE_MS = 400;

/** sdoc block-format lint — complements (never repeats) the Svelte LS. */
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

		// The parser reports syntax and semantic problems with source spans.
		const parsed = parseSdoc(text);
		for (const d of parsed.diagnostics) {
			diagnostics.push(
				new vscode.Diagnostic(
					rangeAt(doc, d.span.start, Math.max(1, d.span.end - d.span.start)),
					`sdocs: ${d.message}`,
					vscode.DiagnosticSeverity.Warning,
				),
			);
		}

		// component={X} must reference an identifier that exists in the file.
		const declared = importedIdentifiers(text);
		const scanned = scanSdoc(text);
		const script = scanned.script?.content ?? '';
		for (const entity of scanned.entities) {
			for (const block of entity.blocks) {
				if (block.kind !== 'preview') continue;
				const attr = block.attrs.component;
				if (!attr || attr.kind !== 'expression') continue;
				const name = attr.raw.trim();
				if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) continue; // parser already flags these
				const exists =
					declared.has(name) ||
					new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`).test(script);
				if (!exists) {
					const lead = attr.raw.length - attr.raw.trimStart().length;
					diagnostics.push(
						new vscode.Diagnostic(
							rangeAt(doc, attr.valueSpan.start + lead, name.length),
							`sdocs: \`${name}\` is not imported or declared in this file's <script>.`,
							vscode.DiagnosticSeverity.Warning,
						),
					);
				}
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
