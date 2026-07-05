import * as vscode from 'vscode';
import { detectScopes, type Scope } from './scopes';
import type { SdocsRunner } from './SdocsRunner';
import type { SdocsPanels } from './SdocsPanels';

/** Card-based "Projects" sidebar. */
export class ScopesWebview implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(
		private runner: SdocsRunner,
		private panels: SdocsPanels,
	) {
		runner.onDidChange(() => void this.render());
	}

	resolveWebviewView(view: vscode.WebviewView) {
		this.view = view;
		view.webview.options = { enableScripts: true };
		view.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
		view.onDidChangeVisibility(() => void this.render());
		void this.render();
	}

	refresh() {
		void this.render();
	}

	private async onMessage(msg: { type: string; dir: string; label?: string }) {
		switch (msg.type) {
			case 'run':
				await this.runner.open(msg.dir);
				break;
			case 'open': {
				const url = this.runner.url(msg.dir);
				if (url) this.panels.open(msg.dir, url, msg.label ?? 'docs');
				break;
			}
			case 'external':
				await this.runner.openExternal(msg.dir);
				break;
			case 'restart': {
				// Mirror the sdocs.restartServer command: placeholder in any open
				// docs tab, restart, then force its iframe to reload once the
				// fresh server reports ready (both no-op without a tab).
				this.panels.showRestarting(msg.dir);
				const ready = new Promise<void>((resolve) => {
					const sub = this.runner.onReady(({ dir }) => {
						if (dir === msg.dir) {
							sub.dispose();
							resolve();
						}
					});
				});
				await this.runner.restart(msg.dir);
				await ready;
				this.panels.reload(msg.dir);
				break;
			}
			case 'stop':
				this.runner.stop(msg.dir);
				this.panels.close(msg.dir);
				break;
		}
	}

	private async render() {
		if (!this.view) return;
		const scopes = await detectScopes();
		this.view.webview.html = pageHtml(
			scopes.map((scope) => this.card(scope)).join('\n'),
		);
	}

	private card(scope: Scope): string {
		const status = this.runner.status(scope.dir);
		const url = this.runner.url(scope.dir);
		const port = url ? new URL(url).port : null;
		const dir = escapeHtml(scope.dir);
		const label = escapeHtml(scope.label);

		const statusChip =
			status === 'running'
				? `<span class="chip running">running${port ? ` · :${port}` : ''}</span>`
				: status === 'starting'
					? `<span class="chip starting">starting…</span>`
					: '';

		const actions =
			status === 'running'
				? `<button class="primary" data-type="open" data-dir="${dir}" data-label="${label}" title="Open the Explorer tab">Open</button>
				   <button data-type="external" data-dir="${dir}" title="Open in your browser">Browser ↗</button>
				   <button data-type="restart" data-dir="${dir}" title="Restart the server">↻ Restart</button>
				   <button class="danger" data-type="stop" data-dir="${dir}" title="Stop the server">Stop</button>`
				: status === 'starting'
					? `<button disabled>Starting…</button>`
					: `<button class="primary" data-type="run" data-dir="${dir}" title="Start sdocs here">▶ Run</button>`;

		return `<div class="card ${status}">
			<div class="head">
				<span class="dot ${status}"></span>
				<span class="name">${label}</span>
				${statusChip}
			</div>
			<div class="path" title="${dir}">${escapeHtml(scope.relPath)}</div>
			${url ? `<div class="url">${escapeHtml(url)}</div>` : ''}
			<div class="actions">${actions}</div>
		</div>`;
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function pageHtml(cards: string): string {
	return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
	body {
		padding: 4px 8px;
		color: var(--vscode-foreground);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
	}
	.empty { opacity: .75; padding: 8px 4px; line-height: 1.5; }
	.card {
		background: var(--vscode-editorWidget-background, rgba(128,128,128,.08));
		border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25));
		border-radius: 6px;
		padding: 10px 12px;
		margin: 8px 0;
	}
	.card.running { border-color: var(--vscode-charts-green, #3fb950); }
	.head { display: flex; align-items: center; gap: 7px; min-width: 0; }
	.name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--vscode-descriptionForeground); opacity: .5; }
	.dot.running { background: var(--vscode-charts-green, #3fb950); opacity: 1; }
	.dot.starting { background: var(--vscode-charts-yellow, #d29922); opacity: 1; animation: pulse 1s infinite alternate; }
	@keyframes pulse { from { opacity: .35; } to { opacity: 1; } }
	.chip {
		margin-left: auto; flex: none;
		font-size: 10px; padding: 1px 7px; border-radius: 999px;
		background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
	}
	.chip.running { background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 22%, transparent); color: var(--vscode-foreground); }
	.path {
		margin-top: 3px; font-size: 11px; color: var(--vscode-descriptionForeground);
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.url {
		margin-top: 6px;
		font-family: var(--vscode-editor-font-family, monospace); font-size: 11px;
		color: var(--vscode-textLink-foreground);
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.actions { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }
	button {
		border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer;
		font-size: 11px; font-family: inherit;
		background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.2));
		color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
	}
	button:hover { filter: brightness(1.15); }
	button:disabled { opacity: .5; cursor: default; }
	button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
	button.danger:hover { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); }
</style>
</head>
<body>
	${cards || '<div class="empty">No sdocs projects found in this workspace.<br>A project is a folder with an <b>sdocs.config</b> file or <b>.sdoc</b> files.</div>'}
	<script>
		const vscode = acquireVsCodeApi();
		document.addEventListener('click', (e) => {
			const button = e.target.closest('button[data-type]');
			if (!button) return;
			vscode.postMessage({
				type: button.dataset.type,
				dir: button.dataset.dir,
				label: button.dataset.label,
			});
		});
	</script>
</body>
</html>`;
}
