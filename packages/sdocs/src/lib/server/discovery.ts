import { resolve } from 'node:path';
import { glob } from 'tinyglobby';
import { loadConfig } from './config.js';
import type { ResolvedSdocsConfig } from '../types.js';

/** Discover all .sdoc files matching the include patterns */
export async function discoverDocFiles(
	include: string[],
	root: string,
): Promise<string[]> {
	const files = await glob(include, {
		cwd: root,
		absolute: true,
	});
	return files.sort();
}

/** The project's config, and every .sdoc its `include` globs match — resolved
 * against `cwd`, the project root. What each command and tool that reads the
 * whole project starts from. */
export async function projectDocFiles(
	cwd: string,
): Promise<{ config: ResolvedSdocsConfig; files: string[] }> {
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);
	return { config, files };
}

/** The static directory prefix of a glob pattern — every path segment before
 * the first one containing glob magic. A literal file path returns its own
 * directory. Watching these roots recursively catches docs added in
 * brand-new directories, which per-file watching never sees. */
export function globBase(pattern: string): string {
	const segments = pattern.split('/');
	const out: string[] = [];
	for (const seg of segments.slice(0, -1)) {
		if (/[*?[\]{}()!]/.test(seg)) break;
		out.push(seg);
	}
	// A one-segment relative pattern ('*.sdoc') has no static prefix.
	return out.join('/') || (pattern.startsWith('/') ? '/' : '.');
}
