import * as vscode from 'vscode';
import * as path from 'node:path';
import { MetaCompletionProvider } from './MetaCompletionProvider';
import { SdocDiagnostics } from './SdocDiagnostics';
import { newComponentDoc } from './newComponentDoc';
import { SdocsRunner } from './SdocsRunner';
import { SdocsPanels } from './SdocsPanels';
import { ScopesWebview } from './ScopesWebview';

export function activate(context: vscode.ExtensionContext) {
	// .sdoc files are registered as the `svelte` language (see contributes.languages),
	// so the Svelte language server provides completion, hover, diagnostics, and
	// formatting. This extension only adds sdocs-specific extras on top, scoped
	// by file pattern so plain .svelte files are untouched.
	const runner = new SdocsRunner();
	const panels = new SdocsPanels();
	const scopesView = new ScopesWebview(runner, panels);

	context.subscriptions.push(
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
