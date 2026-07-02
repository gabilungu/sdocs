import * as vscode from 'vscode';
import { MetaCompletionProvider } from './MetaCompletionProvider';
import { SdocDiagnostics } from './SdocDiagnostics';
import { newComponentDoc } from './newComponentDoc';
import { SdocsRunner } from './SdocsRunner';
import { ScopesProvider, type Scope } from './ScopesProvider';

export function activate(context: vscode.ExtensionContext) {
	// .sdoc files are registered as the `svelte` language (see contributes.languages),
	// so the Svelte language server provides completion, hover, diagnostics, and
	// formatting. This extension only adds sdocs-specific extras on top, scoped
	// by file pattern so plain .svelte files are untouched.
	const runner = new SdocsRunner();
	const scopes = new ScopesProvider(runner);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: 'svelte', pattern: '**/*.sdoc' },
			new MetaCompletionProvider(),
		),
		new SdocDiagnostics(),
		runner,
		vscode.window.registerTreeDataProvider('sdocsScopes', scopes),
		vscode.commands.registerCommand('sdocs.newComponentDoc', newComponentDoc),
		vscode.commands.registerCommand('sdocs.openScope', (scope: Scope) => runner.open(scope.dir)),
		vscode.commands.registerCommand('sdocs.openScopeExternal', (scope: Scope) =>
			runner.openExternal(scope.dir),
		),
		vscode.commands.registerCommand('sdocs.stopScope', (scope: Scope) => runner.stop(scope.dir)),
		vscode.commands.registerCommand('sdocs.refreshScopes', () => scopes.refresh()),
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
