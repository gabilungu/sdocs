import { glob } from 'tinyglobby';

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
