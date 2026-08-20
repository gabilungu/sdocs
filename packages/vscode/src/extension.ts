import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { BlockCompletionProvider } from './BlockCompletionProvider';
import { ConfigCompletionProvider } from './ConfigCompletionProvider';
import { SdocDiagnostics } from './SdocDiagnostics';
import { newComponentDoc } from './newComponentDoc';
import { SdocsRunner } from './SdocsRunner';
import { SdocsPanels } from './SdocsPanels';
import { ScopesWebview } from './ScopesWebview';
import { registerMcpProvider } from './McpProvider';

// sdocs.config.* files register as the `sdocs-config` language so the
// explorer shows the mascot icon — but the TS language server only serves
// `javascript`/`typescript` documents, so open config docs flip over.
// .sdoc files keep their own language: the bundled sdoc language server
// provides Svelte intelligence inside block bodies.
function flipTarget(doc: vscode.TextDocument): string | undefined {
	if (doc.languageId === 'sdocs-config') {
		return doc.fileName.endsWith('.ts') ? 'typescript' : 'javascript';
	}
	return undefined;
}

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
	const flip = (doc: vscode.TextDocument) => {
		const target = flipTarget(doc);
		if (target) void vscode.languages.setTextDocumentLanguage(doc, target);
	};
	vscode.workspace.textDocuments.forEach(flip);

	// The sdoc language server: a line-preserving Svelte projection served by
	// an embedded svelte-language-server, running in its own node process.
	const serverModule = context.asAbsolutePath('dist/server.js');
	client = new LanguageClient(
		'sdocsLanguageServer',
		'sdocs Language Server',
		{
			run: { module: serverModule, transport: TransportKind.ipc },
			debug: { module: serverModule, transport: TransportKind.ipc },
		},
		{
			documentSelector: [{ scheme: 'file', language: 'sdoc' }],
		},
	);
	void client.start();

	const runner = new SdocsRunner();
	const panels = new SdocsPanels(context.extensionUri);
	const scopesView = new ScopesWebview(runner, panels);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(flip),
		vscode.languages.registerCompletionItemProvider(
			{ language: 'sdoc' },
			new BlockCompletionProvider(),
			'[', '{',
		),
		// Config completion matches by filename (the doc may be flipped to
		// js/ts), and defers to the TypeScript type when `sdocs` is installed.
		vscode.languages.registerCompletionItemProvider(
			{ pattern: '**/sdocs.config.{js,cjs,mjs,ts,mts,cts}' },
			new ConfigCompletionProvider(),
			':', "'", '"',
		),
		new SdocDiagnostics(),
		runner,
		panels,
		registerMcpProvider(),
		vscode.window.registerWebviewViewProvider('sdocsScopes', scopesView),
		runner.onReady(({ dir, url }) => panels.open(dir, url, path.basename(dir))),
		vscode.commands.registerCommand('sdocs.newComponentDoc', newComponentDoc),
		vscode.commands.registerCommand('sdocs.refreshScopes', () => scopesView.refresh()),
		vscode.commands.registerCommand('sdocs.refreshPreview', () => panels.refreshActive()),
		vscode.commands.registerCommand('sdocs.openInBrowser', () => panels.openActiveExternally()),
		vscode.commands.registerCommand('sdocs.restartServer', async () => {
			const dir = panels.activeScopeDir();
			if (!dir) return;
			panels.showRestarting(dir);
			// Resolve once the freshly restarted server reports its URL, then
			// force the iframe to reload (the URL may be unchanged, so open()'s
			// diff won't reload it on its own).
			const ready = new Promise<void>((resolve) => {
				const sub = runner.onReady(({ dir: d }) => {
					if (d === dir) {
						sub.dispose();
						resolve();
					}
				});
			});
			await runner.restart(dir);
			await ready;
			panels.reload(dir);
		}),
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

export function deactivate(): Thenable<void> | undefined {
	return client?.stop();
}
