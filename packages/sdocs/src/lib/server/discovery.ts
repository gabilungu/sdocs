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
