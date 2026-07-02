import * as vscode from 'vscode';
import * as path from 'node:path';
import { MetaCompletionProvider } from './MetaCompletionProvider';
import { SdocDiagnostics } from './SdocDiagnostics';
import { newComponentDoc } from './newComponentDoc';
import { SdocsRunner } from './SdocsRunner';
import { SdocsPanels } from './SdocsPanels';
import { ScopesWebview } from './ScopesWebview';

// The sdoc/sdoc-page/sdoc-layout/sdocs-config language contributions exist so
// the explorer shows per-variant file icons — but the Svelte and TS language
// servers only serve documents whose language id is `svelte`/`javascript`/
// `typescript`. Flipping each document as it opens keeps both: the static
// file-to-language mapping (which drives explorer icons) stays ours, while
// open documents get the real language service.
function flipTarget(doc: vscode.TextDocument): string | undefined {
	switch (doc.languageId) {
		case 'sdoc':
		case 'sdoc-page':
		case 'sdoc-layout':
			return 'svelte';
		case 'sdocs-config':
			return doc.fileName.endsWith('.ts') ? 'typescript' : 'javascript';
	}
	return undefined;
}

export function activate(context: vscode.ExtensionContext) {
	// .sdoc files run as the `svelte` language (via flipTarget above), so the
	// Svelte language server provides completion, hover, diagnostics, and
	// formatting. This extension only adds sdocs-specific extras on top, scoped
	// by file pattern so plain .svelte files are untouched.
	const flip = (doc: vscode.TextDocument) => {
		const target = flipTarget(doc);
		if (target) void vscode.languages.setTextDocumentLanguage(doc, target);
	};
	vscode.workspace.textDocuments.forEach(flip);

	const runner = new SdocsRunner();
	const panels = new SdocsPanels(context.extensionUri);
	const scopesView = new ScopesWebview(runner, panels);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(flip),
		vscode.languages.registerCompletionItemProvider(
			{ language: 'svelte', pattern: '**/*.sdoc' },
			new MetaCompletionProvider(),
		),
		new SdocDiagnostics(),
		runner,
		panels,
		vscode.window.registerWebviewViewProvider('sdocsScopes', scopesView),
		runner.onReady(({ dir, url }) => panels.open(dir, url, path.basename(dir))),
		vscode.commands.registerCommand('sdocs.newComponentDoc', newComponentDoc),
		vscode.commands.registerCommand('sdocs.refreshScopes', () => scopesView.refresh()),
	);

	// Versions up to 0.0.13 formatted via scratch files under
	// node_modules/.cache/sdocs-format; sweep any leftovers from crashed sessions.
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const dir = vscode.Uri.joinPath(folder.uri, 'node_modules', '.cache', 'sdocs-format');
		vscode.workspace.fs.delete(dir, { recursive: true, useTrash: false }).then(
			undefined,
			() => {},
		);
	}
}

export function deactivate() {}
