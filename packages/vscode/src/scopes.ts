import * as vscode from 'vscode';
import * as path from 'node:path';

export interface Scope {
	/** Absolute directory sdocs runs in */
	dir: string;
	/** Folder name (card title) */
	label: string;
	/** Workspace-relative parent path (card subtitle) */
	relPath: string;
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

	return [...dirs].sort().map((dir) => ({
		dir,
		label: path.basename(dir),
		relPath: workspaceLabel(dir),
	}));
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
	return rel === '' ? folder.name : rel;
}
