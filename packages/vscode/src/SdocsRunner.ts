import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';

export type ScopeStatus = 'stopped' | 'starting' | 'running';

export interface RunningScope {
	process: ChildProcess;
	status: ScopeStatus;
	url?: string;
}

/** Starts and stops `sdocs run` processes, one per scope directory. */
export class SdocsRunner implements vscode.Disposable {
	private scopes = new Map<string, RunningScope>();
	private output = vscode.window.createOutputChannel('sdocs');
	private emitter = new vscode.EventEmitter<void>();
	private readyEmitter = new vscode.EventEmitter<{ dir: string; url: string }>();
	/** Fires on any status change. */
	readonly onDidChange = this.emitter.event;
	/** Fires when a scope's server URL is known (or requested again while running). */
	readonly onReady = this.readyEmitter.event;

	status(scopeDir: string): ScopeStatus {
		return this.scopes.get(scopeDir)?.status ?? 'stopped';
	}

	url(scopeDir: string): string | undefined {
		return this.scopes.get(scopeDir)?.url;
	}

	/** Start sdocs in the scope; announces readiness via onReady. */
	async open(scopeDir: string): Promise<void> {
		const existing = this.scopes.get(scopeDir);
		if (existing?.status === 'running' && existing.url) {
			this.readyEmitter.fire({ dir: scopeDir, url: existing.url });
			return;
		}
		if (existing) return; // starting — onReady will fire when the URL appears

		const [command, args] = this.launchCommand(scopeDir);
		this.output.appendLine(`[${scopeDir}] ${command} ${args.join(' ')}`);
		const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
		delete env.FORCE_COLOR;
		const child = spawn(command, args, {
			cwd: scopeDir,
			env,
			shell: process.platform === 'win32',
		});
		const scope: RunningScope = { process: child, status: 'starting' };
		this.scopes.set(scopeDir, scope);
		this.emitter.fire();

		const onData = (data: Buffer) => {
			// Strip ANSI escape codes: they garble the output channel, and stray
			// codes inside the printed URL would defeat detection.
			const text = data.toString().replace(/\x1b\[[0-9;]*m/g, '');
			this.output.append(text);
			if (!scope.url) {
				const match = text.match(/https?:\/\/localhost:\d+\//);
				if (match) {
					scope.url = match[0];
					scope.status = 'running';
					this.output.appendLine(`[${scopeDir}] ready at ${scope.url}`);
					this.emitter.fire();
					this.readyEmitter.fire({ dir: scopeDir, url: scope.url });
				}
			}
		};
		child.stdout?.on('data', onData);
		child.stderr?.on('data', onData);
		child.on('exit', (code) => {
			this.output.appendLine(`[${scopeDir}] exited (${code ?? 'signal'})`);
			this.scopes.delete(scopeDir);
			this.emitter.fire();
		});
	}

	stop(scopeDir: string): void {
		this.scopes.get(scopeDir)?.process.kill('SIGTERM');
	}

	/** Open a running scope in the system browser. */
	async openExternal(scopeDir: string): Promise<void> {
		const url = this.scopes.get(scopeDir)?.url;
		if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
	}

	/** Prefer the scope's own sdocs install; fall back to npx. */
	private launchCommand(scopeDir: string): [string, string[]] {
		try {
			// Resolve a real export ('sdocs/vite' → <pkg>/dist/vite.js) and derive
			// the bin from it; './package.json' isn't guaranteed to be exported.
			const require = createRequire(path.join(scopeDir, 'noop.js'));
			const vitePlugin = require.resolve('sdocs/vite');
			const bin = path.join(path.dirname(vitePlugin), '..', 'bin', 'sdocs.js');
			return [process.execPath, [bin, 'run']];
		} catch {
			return ['npx', ['--yes', 'sdocs', 'run']];
		}
	}

	dispose() {
		for (const scope of this.scopes.values()) scope.process.kill('SIGTERM');
		this.scopes.clear();
		this.output.dispose();
		this.emitter.dispose();
		this.readyEmitter.dispose();
	}
}
