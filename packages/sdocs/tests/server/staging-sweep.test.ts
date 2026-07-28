/**
 * Staging directories are created per run and removed at shutdown — but a killed dev
 * server never reaches cleanup, so they piled up (four, ~3.5 MB, in one project). The
 * sweep clears the abandoned ones by OWNER PID, never by age: two sdocs servers on two
 * ports are normal, and an age rule would delete the other one's directory mid-run.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __testing } from '../../src/lib/server/app-gen.js';

const dirs: string[] = [];
const parent = () => {
	const dir = mkdtempSync(join(tmpdir(), 'sdocs-sweep-'));
	dirs.push(dir);
	return dir;
};
const stage = (root: string, name: string, owner?: string) => {
	const dir = join(root, name);
	mkdirSync(dir, { recursive: true });
	if (owner !== undefined) writeFileSync(join(dir, '.sdocs-owner'), owner, 'utf-8');
	return dir;
};

describe('sweepAbandonedStagingDirs', () => {
	it('removes a directory whose owner is gone', async () => {
		const root = parent();
		// A pid that cannot be running: the max is 2^22 on Linux, far less on macOS.
		stage(root, 'sdocs-dead', '4194303');
		await __testing.sweepAbandonedStagingDirs(root);
		expect(readdirSync(root)).toEqual([]);
	});

	it('spares a directory another LIVE sdocs owns', async () => {
		const root = parent();
		stage(root, 'sdocs-live', String(process.pid));
		await __testing.sweepAbandonedStagingDirs(root);
		expect(readdirSync(root)).toEqual(['sdocs-live']);
	});

	it('treats an unowned directory as abandoned (it predates the pid file)', async () => {
		const root = parent();
		stage(root, 'sdocs-legacy');
		await __testing.sweepAbandonedStagingDirs(root);
		expect(readdirSync(root)).toEqual([]);
	});

	it('never touches anything that is not a staging directory', async () => {
		const root = parent();
		stage(root, 'sdocs-dead', '4194303');
		stage(root, 'vite', undefined);
		mkdirSync(join(root, 'something-else'), { recursive: true });
		await __testing.sweepAbandonedStagingDirs(root);
		expect(readdirSync(root).sort()).toEqual(['something-else', 'vite']);
	});
});

process.on('exit', () => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
