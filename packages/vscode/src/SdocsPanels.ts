import * as vscode from 'vscode';

interface Entry {
	panel: vscode.WebviewPanel;
	url: string;
}

/** One preview panel per project — opening again reveals the existing tab. */
export class SdocsPanels implements vscode.Disposable {
	private panels = new Map<string, Entry>();

	constructor(private extensionUri: vscode.Uri) {}

	open(scopeDir: string, url: string, title: string): void {
		const existing = this.panels.get(scopeDir);
		if (existing) {
			if (existing.url !== url) {
				existing.url = url;
				existing.panel.webview.html = iframeHtml(url);
			}
			existing.panel.reveal();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sdocsPreview',
			`sdocs — ${title}`,
			vscode.ViewColumn.Active,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'icons', 'sdocs-icon.png');
		panel.webview.html = iframeHtml(url);
		panel.onDidDispose(() => this.panels.delete(scopeDir));
		this.panels.set(scopeDir, { panel, url });
	}

	close(scopeDir: string): void {
		this.panels.get(scopeDir)?.panel.dispose();
	}

	dispose() {
		for (const { panel } of this.panels.values()) panel.dispose();
		this.panels.clear();
	}
}

function iframeHtml(url: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; frame-src http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline';">
	<style>
		html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
		iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
	</style>
</head>
<body>
	<iframe src="${url}" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`;
}
