import { resolve } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { generateDevFiles, cleanBuildFiles } from '../server/app-gen.js';

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
		plugins: [
			svelte(),
			sdocsPlugin({ ...config, include: absoluteIncludes }),
		],
		server: {
			port: config.port,
			open: config.open,
			fs: {
				allow: [cwd],
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
