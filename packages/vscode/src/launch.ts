import { createRequire } from 'node:module';
import * as path from 'node:path';

/**
 * Prefer the scope's own sdocs install; fall back to npx.
 *
 * `shell` is per-command, and false wherever it can be. Windows used to get
 * a shell either way, which meant the local-install path handed `cmd.exe` a
 * command line built from the project's own directory — so a project under
 * `C:\Users\First Last\...` split at the space and one under a path
 * containing `&` ran whatever followed it. Node needs no shell for a real
 * executable, and `process.execPath` is one.
 *
 * The npx fallback still needs it: npx is `npx.cmd` on Windows, which Node
 * refuses to execute directly. Its arguments are three constants, so there
 * is nothing there for a shell to reinterpret.
 */
export function launchCommand(
	scopeDir: string,
	// A parameter so the Windows branch is testable off Windows: CI runs Linux,
	// and a rule that only holds on the platform nobody tests is not a rule.
	platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; shell: boolean } {
	try {
		// Resolve a real export ('sdocs/vite' → <pkg>/dist/vite.js) and derive
		// the bin from it; './package.json' isn't guaranteed to be exported.
		const require = createRequire(path.join(scopeDir, 'noop.js'));
		const vitePlugin = require.resolve('sdocs/vite');
		const bin = path.join(path.dirname(vitePlugin), '..', 'bin', 'sdocs.js');
		return { command: process.execPath, args: [bin, 'run'], shell: false };
	} catch {
		return {
			command: 'npx',
			args: ['--yes', 'sdocs', 'run'],
			shell: platform === 'win32',
		};
	}
}
