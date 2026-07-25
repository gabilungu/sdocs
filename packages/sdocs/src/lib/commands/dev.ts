import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { mcpHttpHandler } from '../mcp/http.js';
import { generateDevFiles, cleanBuildFiles } from '../server/app-gen.js';
import { sdocsWarningFilter } from '../server/snippet-compiler.js';

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

	// Generate the staging directory (in the OS temp dir) with entry files
	const sdocsDir = await generateDevFiles(config, cwd);

	// Resolve include patterns to absolute paths (relative to cwd, not the staging dir)
	const absoluteIncludes = config.include.map((p) => resolve(cwd, p));

	const server = await createServer({
		configFile: false,
		root: sdocsDir,
		// The project's static assets (config `static`), served at the site root
		publicDir: config.static ?? false,
		resolve: {
			dedupe: svelteDedupe(cwd),
		},
		optimizeDeps: {
			// Rolldown-based Vite (8+) can't scan .svelte entry graphs and floods
			// the console with unresolved-import errors. Skip the initial scan —
			// runtime discovery still optimizes dependencies on demand — and
			// pre-bundle the one dependency the Explorer app always needs.
			entries: [],
			include: ['svelte'],
		},
		plugins: [
			svelte({
				compilerOptions: {
					// The staging dir lives under node_modules (see createStagingDir),
					// where vite-plugin-svelte doesn't serve virtual CSS modules for
					// components; inject styles into the JS instead.
					css: 'injected',
					warningFilter: sdocsWarningFilter,
				},
			}),
			sdocsPlugin({ ...config, include: absoluteIncludes }),
			...(config.mcp
				? [
						{
							// The MCP authoring endpoint — dev server only, never in a build.
							name: 'sdocs-mcp-endpoint',
							configureServer(s: import('vite').ViteDevServer) {
								s.middlewares.use('/mcp', mcpHttpHandler());
							},
						},
					]
				: []),
		],
		server: {
			port: config.port,
			open: config.open,
			fs: {
				// The staging dir (an explicit allow list replaces Vite's implicit
				// root allowance), the project, and sdocs' own dependency tree
				// (the npx cache when running without a local install).
				allow: [sdocsDir, cwd, resolve(sdocsPackageRoot(), '..')],
			},
		},
	});

	await server.listen();
	server.printUrls();
	const localUrl = server.resolvedUrls?.local[0];
	if (config.mcp && localUrl) console.log(`  ➜  MCP:      ${localUrl}mcp`);

	// Cleanup on exit
	const cleanup = async () => {
		await server.close();
		await cleanBuildFiles(sdocsDir);
		process.exit(0);
	};

	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);
}
