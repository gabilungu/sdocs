import { glob } from 'tinyglobby';
import { resolve } from 'node:path';

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

/** Get the absolute path for a relative import */
export function resolveImportPath(importPath: string, fromFile: string): string {
	const dir = fromFile.substring(0, fromFile.lastIndexOf('/'));
	return resolve(dir, importPath);
}
