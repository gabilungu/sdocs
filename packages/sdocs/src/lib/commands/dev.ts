import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { generateDevFiles, cleanBuildFiles } from '../server/app-gen.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** sdocs' own install location — under npx this is the npx cache, not the project */
export function sdocsPackageRoot(): string {
	return resolve(__dirname, '../..');
}

/**
 * Prefer the project's own svelte over the copy next to sdocs when both exist
 * (e.g. running via npx): previews import the project's components, and two
 * svelte runtimes in one page don't mix.
 */
export function svelteDedupe(cwd: string): string[] {
	try {
		require.resolve('svelte/package.json', { paths: [cwd] });
		return ['svelte'];
	} catch {
		return [];
	}
}

export async function devCommand(): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	console.log('[sdocs] Starting dev server...');

	// Generate .sdocs/ temp directory with entry files
	const sdocsDir = await generateDevFiles(config, cwd);

	// Resolve include patterns to absolute paths (relative to cwd, not .sdocs/)
	const absoluteIncludes = config.include.map((p) => resolve(cwd, p));

	const server = await createServer({
		configFile: false,
		root: sdocsDir,
		resolve: {
			dedupe: svelteDedupe(cwd),
		},
		plugins: [
			svelte(),
			sdocsPlugin({ ...config, include: absoluteIncludes }),
		],
		server: {
			port: config.port,
			open: config.open,
			fs: {
				// The project, plus sdocs' own dependency tree (the npx cache
				// when running without a local install).
				allow: [cwd, resolve(sdocsPackageRoot(), '..')],
			},
		},
	});

	await server.listen();
	server.printUrls();

	// Cleanup on exit
	const cleanup = async () => {
		await server.close();
		await cleanBuildFiles(cwd);
		process.exit(0);
	};

	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);
}
