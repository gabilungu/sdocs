/**
 * How the Projects view starts a server, and specifically when it hands the
 * command to a shell.
 *
 * Windows used to get one either way, which meant the local-install path
 * handed `cmd.exe` a command line assembled from the project's own directory.
 * A project under `C:\Users\First Last\...` split at the space and never
 * started; one under a path containing `&` ran whatever came after it. Node
 * needs no shell to launch a real executable, and `process.execPath` is one.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchCommand } from '../src/launch.js';

/** A scope directory with a real `sdocs` install in its node_modules. */
function withInstall(): string {
	// realpathSync: on macOS /var is a symlink to /private/var, and the require
	// resolver returns the real path while the fixture remembers the link.
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-launch-')));
	const pkg = join(dir, 'node_modules', 'sdocs');
	mkdirSync(join(pkg, 'dist'), { recursive: true });
	mkdirSync(join(pkg, 'bin'), { recursive: true });
	writeFileSync(join(pkg, 'dist', 'vite.js'), 'export const sdocsPlugin = () => ({});\n');
	writeFileSync(join(pkg, 'bin', 'sdocs.js'), '#!/usr/bin/env node\n');
	writeFileSync(
		join(pkg, 'package.json'),
		JSON.stringify({
			name: 'sdocs',
			version: '0.0.0',
			type: 'module',
			exports: { './vite': './dist/vite.js' },
		}),
	);
	return dir;
}

describe('launchCommand', () => {
	it('runs a local install through node, with no shell', () => {
		const { command, args, shell } = launchCommand(withInstall());
		expect(command).toBe(process.execPath);
		expect(args[args.length - 1]).toBe('run');
		expect(args[0]).toContain('sdocs.js');
		expect(shell).toBe(false);
	});

	it('never puts a project path on a shell command line', () => {
		// The path is the whole point: it is the one part of the command the
		// user controls, and a shell would reinterpret it.
		const dir = withInstall();
		const { args, shell } = launchCommand(dir);
		expect(shell).toBe(false);
		expect(args.some((a) => a.includes(dir))).toBe(true);
	});

	it('falls back to npx when the scope has no install', () => {
		const empty = mkdtempSync(join(tmpdir(), 'sdocs-launch-empty-'));
		const { command, args } = launchCommand(empty);
		expect(command).toBe('npx');
		expect(args).toEqual(['--yes', 'sdocs', 'run']);
	});

	it('uses no shell on Windows either, for a local install', () => {
		// The case that broke: this is the branch carrying the project path.
		expect(launchCommand(withInstall(), 'win32').shell).toBe(false);
	});

	it('shells the npx fallback only on Windows, and with constants only', () => {
		// npx is `npx.cmd` there and Node will not execute it directly, so that
		// one keeps its shell — with nothing in it for a shell to reinterpret.
		const empty = mkdtempSync(join(tmpdir(), 'sdocs-launch-empty-'));
		expect(launchCommand(empty, 'win32').shell).toBe(true);
		expect(launchCommand(empty, 'darwin').shell).toBe(false);
		expect(launchCommand(empty, 'linux').shell).toBe(false);
		for (const arg of launchCommand(empty, 'win32').args) expect(arg).toMatch(/^[a-z-]+$/);
	});

	it('resolves the bin next to the package, not next to dist', () => {
		const dir = withInstall();
		const { args } = launchCommand(dir);
		expect(resolve(args[0])).toBe(resolve(dir, 'node_modules/sdocs/bin/sdocs.js'));
	});
});
