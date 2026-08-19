import * as vscode from 'vscode';

interface Entry {
	panel: vscode.WebviewPanel;
	url: string;
	/** The Explorer's last announced location — where refresh/restart return to. */
	lastHref?: string;
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
				existing.lastHref = undefined;
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
		// The Explorer announces route changes; remember them so refresh and
		// restart return to the same page instead of the root.
		panel.webview.onDidReceiveMessage(async (msg: { type?: string; href?: string }) => {
			if (typeof msg?.href !== 'string') return;
			const entry = this.panels.get(scopeDir);
			// The href comes from a page the extension did not author, so it is
			// only ever honoured when it points back at this project's own
			// server — never at an arbitrary URL a doc could name.
			if (!entry || !sameOrigin(msg.href, entry.url)) return;
			if (msg.type === 'route') entry.lastHref = msg.href;
			if (msg.type === 'openExternal') await openStageUrl(msg.href);
		});
		panel.onDidDispose(() => this.panels.delete(scopeDir));
		this.panels.set(scopeDir, { panel, url });
	}

	close(scopeDir: string): void {
		this.panels.get(scopeDir)?.panel.dispose();
	}

	/** Reload the iframe of the currently active preview panel */
	refreshActive(): void {
		for (const entry of this.panels.values()) {
			// Setting identical html is a no-op (VS Code diffs it), so stamp
			// each refresh to force the webview — and its iframe — to reload.
			if (entry.panel.active) {
				entry.panel.webview.html = iframeHtml(entry.lastHref ?? entry.url, ++this.refreshCount);
			}
		}
	}

	/** The scope directory of the currently active preview panel, if any. */
	activeScopeDir(): string | undefined {
		for (const [dir, { panel }] of this.panels) {
			if (panel.active) return dir;
		}
		return undefined;
	}

	/** Force the panel's iframe to reload at its last known location. */
	reload(scopeDir: string): void {
		const entry = this.panels.get(scopeDir);
		if (entry) {
			entry.panel.webview.html = iframeHtml(entry.lastHref ?? entry.url, ++this.refreshCount);
		}
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

/** True when href shares url's origin — a stale route from a previous server
 * (different port) must not survive into the new one. */
/**
 * Show a stage on its own: the editor's built-in Simple Browser when it is
 * available, the machine's default browser when it isn't.
 *
 * Simple Browser ships with VS Code but is an ordinary extension, so it can be
 * disabled or missing from a given build — asking the command registry is the
 * honest check, and `executeCommand` on a command nobody registered throws
 * rather than no-ops.
 */
async function openStageUrl(href: string): Promise<void> {
	const uri = vscode.Uri.parse(href);
	try {
		const commands = await vscode.commands.getCommands(true);
		if (commands.includes(SIMPLE_BROWSER_SHOW)) {
			await vscode.commands.executeCommand(SIMPLE_BROWSER_SHOW, uri);
			return;
		}
	} catch {
		// Fall through — a stage that won't open is worse than one that opens
		// in the wrong place.
	}
	await vscode.env.openExternal(uri);
}

const SIMPLE_BROWSER_SHOW = 'simpleBrowser.show';

function sameOrigin(href: string, url: string): boolean {
	try {
		return new URL(href).origin === new URL(url).origin;
	} catch {
		return false;
	}
}

function iframeHtml(url: string, refresh = 0): string {
	return `<!DOCTYPE html>
<html>
<!-- refresh ${refresh} -->
<head>
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; frame-src http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
	<style>
		html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
		iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
	</style>
</head>
<body>
	<iframe src="${url}" allow="clipboard-read; clipboard-write"></iframe>
	<script>
		const vscode = acquireVsCodeApi();
		// The framed Explorer posts its location on every route change; hand it
		// to the extension so refresh/restart return to the same page.
		window.addEventListener('message', (e) => {
			if (!e.data) return;
			if (e.data.type === 'sdocs:route' && typeof e.data.href === 'string') {
				vscode.postMessage({ type: 'route', href: e.data.href });
			}
			// A stage asking to be opened on its own. This frame is sandboxed
			// without allow-popups, so the Explorer cannot open it itself.
			if (e.data.type === 'sdocs:open-external' && typeof e.data.href === 'string') {
				vscode.postMessage({ type: 'openExternal', href: e.data.href });
			}
		});
	</script>
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
