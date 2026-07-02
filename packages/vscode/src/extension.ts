import * as vscode from 'vscode';
import { MetaCompletionProvider } from './MetaCompletionProvider';
import { SdocFormatProvider } from './SdocFormatProvider';

const SDOC_LANGUAGES = ['sdoc', 'sdoc-page', 'sdoc-layout'];

export function activate(context: vscode.ExtensionContext) {
	// Autocomplete: meta fields in .sdoc files
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: 'sdoc' },
			new MetaCompletionProvider(),
		),
	);

	// Formatting: delegate to the installed Svelte formatter so .sdoc files
	// format exactly like .svelte files — and keep doing so as Svelte evolves,
	// since this extension ships no copy of the Svelte compiler/formatter.
	const output = vscode.window.createOutputChannel('sdocs');
	const formatter = new SdocFormatProvider(output, context.globalStorageUri);
	context.subscriptions.push(
		output,
		formatter,
		vscode.languages.registerDocumentFormattingEditProvider(
			SDOC_LANGUAGES.map((language) => ({ language })),
			formatter,
		),
	);

	// Warm up the Svelte server as soon as an .sdoc is in view, so the first
	// format isn't a dud while the server is still starting (no-op after once).
	const warmUp = (editor: vscode.TextEditor | undefined) => {
		if (editor && SDOC_LANGUAGES.includes(editor.document.languageId)) {
			formatter.warmUp(editor.document);
		}
	};
	warmUp(vscode.window.activeTextEditor);
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(warmUp));
}

export function deactivate() {}
