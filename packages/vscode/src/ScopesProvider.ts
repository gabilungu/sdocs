import * as vscode from 'vscode';
import * as path from 'node:path';
import type { SdocsRunner } from './SdocsRunner';

export interface Scope {
	/** Absolute directory sdocs runs in */
	dir: string;
	/** Label shown in the tree (workspace-relative) */
	label: string;
}

/** Find sdocs scopes: configured ones, sdocs.config.* locations, and .sdoc clusters. */
export async function detectScopes(): Promise<Scope[]> {
	const dirs = new Set<string>();

	// Explicit scopes from settings (workspace-relative or absolute paths)
	const configured = vscode.workspace.getConfiguration('sdocs').get<string[]>('scopes') ?? [];
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		for (const scope of configured) {
			dirs.add(path.isAbsolute(scope) ? scope : path.join(folder.uri.fsPath, scope));
		}
	}

	// Directories with an sdocs config file
	const configs = await vscode.workspace.findFiles(
		'**/sdocs.config.{js,ts,mjs}',
		'**/node_modules/**',
		50,
	);
	for (const uri of configs) dirs.add(path.dirname(uri.fsPath));

	// Fallback: nearest package.json above .sdoc files that have no config scope
	const docs = await vscode.workspace.findFiles('**/*.sdoc', '**/node_modules/**', 200);
	const covered = [...dirs];
	for (const uri of docs) {
		const docDir = path.dirname(uri.fsPath);
		if (covered.some((dir) => docDir.startsWith(dir + path.sep) || docDir === dir)) continue;
		const pkgDir = await nearestPackageDir(docDir);
		if (pkgDir) {
			dirs.add(pkgDir);
			covered.push(pkgDir);
		}
	}

	return [...dirs].sort().map((dir) => ({ dir, label: path.basename(dir) }));
}

async function nearestPackageDir(fromDir: string): Promise<string | null> {
	const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fromDir))?.uri.fsPath;
	if (!root) return null;
	let current = fromDir;
	for (;;) {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(path.join(current, 'package.json')));
			return current;
		} catch {
			if (current === root) return null;
			const parent = path.dirname(current);
			if (parent === current) return null;
			current = parent;
		}
	}
}

function workspaceLabel(dir: string): string {
	const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir));
	if (!folder) return dir;
	const rel = path.relative(folder.uri.fsPath, dir);
	return rel === '' ? folder.name : `${folder.name}/${rel}`;
}

export class ScopesProvider implements vscode.TreeDataProvider<Scope> {
	private emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;
	private scopes: Scope[] = [];

	constructor(private runner: SdocsRunner) {
		runner.onDidChange(() => this.emitter.fire());
	}

	refresh() {
		this.emitter.fire();
	}

	async getChildren(element?: Scope): Promise<Scope[]> {
		if (element) return [];
		this.scopes = await detectScopes();
		return this.scopes;
	}

	getTreeItem(scope: Scope): vscode.TreeItem {
		const status = this.runner.status(scope.dir);
		const item = new vscode.TreeItem(scope.label);
		item.id = scope.dir;
		item.description =
			status === 'running'
				? this.runner.url(scope.dir)?.replace(/^https?:\/\//, '').replace(/\/$/, '')
				: status === 'starting'
					? 'starting'
					: workspaceLabel(path.dirname(scope.dir));
		item.contextValue = status === 'stopped' ? 'sdocs-scope' : 'sdocs-scope-running';
		item.iconPath = new vscode.ThemeIcon(
			status === 'running' ? 'vm-running' : status === 'starting' ? 'loading~spin' : 'book',
		);
		item.tooltip = scope.dir;
		item.command = {
			command: 'sdocs.openScope',
			title: 'Open in sdocs',
			arguments: [scope],
		};
		return item;
	}
}
