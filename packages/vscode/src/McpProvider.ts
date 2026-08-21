import * as vscode from 'vscode';
import * as path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Registers the sdocs MCP server with the editor's MCP client, so agent
 * features work against the real parser and extractor rather than guessing at
 * the format. The server owns the tool list — naming a few of them here only
 * created a second list to keep in step, and it was four releases stale.
 * The editor manages the server's lifecycle: it starts on demand.
 */
export function registerMcpProvider(): vscode.Disposable {
	return vscode.lm.registerMcpServerDefinitionProvider('sdocs.mcp', {
		provideMcpServerDefinitions() {
			const folder = vscode.workspace.workspaceFolders?.[0];
			const { command, args, version } = serverCommand(folder?.uri.fsPath);
			const server = new vscode.McpStdioServerDefinition('sdocs', command, args, {}, version);
			if (folder) server.cwd = folder.uri;
			return [server];
		},
	});
}

/** Prefer the workspace's own sdocs install (same rule as the Projects view
 * runner); fall back to npx, which works with no install at all. */
function serverCommand(cwd: string | undefined): {
	command: string;
	args: string[];
	version?: string;
} {
	if (cwd) {
		try {
			// Resolve a real export ('sdocs/vite' → <pkg>/dist/vite.js) and derive
			// the bin from it; './package.json' isn't guaranteed to be exported.
			const require = createRequire(path.join(cwd, 'noop.js'));
			const vitePlugin = require.resolve('sdocs/vite');
			const root = path.join(path.dirname(vitePlugin), '..');
			const version = (require(path.join(root, 'package.json')) as { version?: string }).version;
			return { command: process.execPath, args: [path.join(root, 'bin', 'sdocs.js'), 'mcp'], version };
		} catch {
			// No local install — npx below.
		}
	}
	return { command: 'npx', args: ['--yes', 'sdocs', 'mcp'] };
}
