import * as vscode from 'vscode';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
		return doc.languageId === 'sdoc';
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

		// Section references must name a section declared in sdocs.config.
		// Config-less projects (or configs too dynamic to read) are skipped.
		const declaredSlugs = declaredSectionSlugs(doc.uri.fsPath);
		if (declaredSlugs) {
			const list = declaredSlugs.map((s) => `"${s}"`).join(', ');
			for (const entity of scanned.entities) {
				const attr = entity.attrs.title;
				if (!attr || attr.kind !== 'string') continue;
				const raw = attr.raw;
				if (!raw.trimStart().startsWith('@')) {
					// A sectionless PAGE is legal: it routes at the site root.
					if (entity.kind === 'PAGE') continue;
					if (!declaredSlugs.includes('docs')) {
						diagnostics.push(
							new vscode.Diagnostic(
								rangeAt(doc, attr.valueSpan.start, Math.max(1, raw.length)),
								`sdocs: no @section prefix, and no "docs" section is declared (sections: ${list}).`,
								vscode.DiagnosticSeverity.Warning,
							),
						);
					}
					continue;
				}
				const m = raw.match(/^(\s*@)([^/]*)/);
				if (!m) continue;
				const ref = m[2].trim();
				if (!declaredSlugs.includes(ref)) {
					diagnostics.push(
						new vscode.Diagnostic(
							rangeAt(doc, attr.valueSpan.start + m[1].length - 1, ref.length + 1),
							`sdocs: unknown section "@${ref}" (sections: ${list}).`,
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

/**
 * Section slugs declared by the project's sdocs.config (found walking up from
 * the doc file). null means "don't check": no config on disk, or a config
 * whose sections can't be read statically. No `sections` key means the
 * implicit lone `docs` section.
 */
function declaredSectionSlugs(docPath: string): string[] | null {
	let dir = dirname(docPath);
	for (let depth = 0; depth < 24; depth++) {
		for (const name of ['sdocs.config.ts', 'sdocs.config.mjs', 'sdocs.config.js']) {
			const candidate = join(dir, name);
			if (!existsSync(candidate)) continue;
			let text: string;
			try {
				text = readFileSync(candidate, 'utf-8');
			} catch {
				return null;
			}
			if (!/\bsections\s*:/.test(text)) return ['docs'];
			const slugs = [...text.matchAll(/\bslug\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
			return slugs.length > 0 ? slugs : null;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}
