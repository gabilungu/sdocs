import * as vscode from 'vscode';

interface Entry {
	panel: vscode.WebviewPanel;
	url: string;
}

/** One preview panel per project — opening again reveals the existing tab. */
export class SdocsPanels implements vscode.Disposable {
	private panels = new Map<string, Entry>();
	private refreshCount = 0;

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
		panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'icons', 'mascot.svg');
		panel.webview.html = iframeHtml(url);
		panel.onDidDispose(() => this.panels.delete(scopeDir));
		this.panels.set(scopeDir, { panel, url });
	}

	close(scopeDir: string): void {
		this.panels.get(scopeDir)?.panel.dispose();
	}

	/** Reload the iframe of the currently active preview panel */
	refreshActive(): void {
		for (const { panel, url } of this.panels.values()) {
			// Setting identical html is a no-op (VS Code diffs it), so stamp
			// each refresh to force the webview — and its iframe — to reload.
			if (panel.active) panel.webview.html = iframeHtml(url, ++this.refreshCount);
		}
	}

	/** The scope directory of the currently active preview panel, if any. */
	activeScopeDir(): string | undefined {
		for (const [dir, { panel }] of this.panels) {
			if (panel.active) return dir;
		}
		return undefined;
	}

	/** Force the panel's iframe to reload at its current URL. */
	reload(scopeDir: string): void {
		const entry = this.panels.get(scopeDir);
		if (entry) entry.panel.webview.html = iframeHtml(entry.url, ++this.refreshCount);
	}

	/** Show a placeholder while the dev server restarts (avoids a dead-iframe flash). */
	showRestarting(scopeDir: string): void {
		const entry = this.panels.get(scopeDir);
		if (entry) entry.panel.webview.html = restartingHtml();
	}

	dispose() {
		for (const { panel } of this.panels.values()) panel.dispose();
		this.panels.clear();
	}
}

function iframeHtml(url: string, refresh = 0): string {
	return `<!DOCTYPE html>
<html>
<!-- refresh ${refresh} -->
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

function restartingHtml(): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
	<style>
		html, body { margin: 0; height: 100%; }
		body {
			display: flex; align-items: center; justify-content: center;
			font-family: var(--vscode-font-family); font-size: 13px;
			color: var(--vscode-descriptionForeground);
			background: var(--vscode-editor-background);
		}
	</style>
</head>
<body>Restarting sdocs…</body>
</html>`;
}
