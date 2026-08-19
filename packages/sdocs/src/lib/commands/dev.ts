import { basename, dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findConfigFile, loadConfig } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { mcpHttpHandler } from '../mcp/http.js';
import { generateDevFiles, cleanBuildFiles } from '../server/app-gen.js';
import { sdocsWarningFilter } from '../server/snippet-compiler.js';
import {
	loadSveltePlugin,
	loadVite,
	svelteDedupe,
	svelteSourceDeps,
} from '../server/svelte-toolchain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** sdocs' own install location — under npx this is the npx cache, not the project */
export function sdocsPackageRoot(): string {
	return resolve(__dirname, '../..');
}

export { svelteDedupe } from '../server/svelte-toolchain.js';

export async function devCommand(): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	console.log('[sdocs] Starting dev server...');

	// One toolchain, the project's: the plugin carries the compiler, dedupe pins the
	// runtime, and both must be the same copy (see svelte-toolchain.ts).
	const svelte = await loadSveltePlugin(cwd);
	const { createServer } = await loadVite(cwd);

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
			// Skipping the scan also skips the plugin's own detection of packages
			// that ship .svelte source, which esbuild cannot prebundle. Runtime
			// discovery would hand them to it anyway and fail, so name them here.
			exclude: svelteSourceDeps(cwd),
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
			sdocsPlugin({ ...config, include: absoluteIncludes, _projectRoot: cwd } as any),
			missingAssetGuard(config.static),
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
			// A configured port is an instruction. Sliding to the next free one
			// hides the usual cause — a stale sdocs for this same project still
			// holding it — behind a server that answers every request with the
			// old config, so edits look ignored and nothing reports an error.
			strictPort: config.portDeclared,
			open: config.open,
			fs: {
				// The staging dir (an explicit allow list replaces Vite's implicit
				// root allowance), the project, and sdocs' own dependency tree
				// (the npx cache when running without a local install).
				allow: [sdocsDir, cwd, resolve(sdocsPackageRoot(), '..')],
			},
		},
	});

	watchConfig(server, cwd);

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

/** Static-asset extensions: files served verbatim, never compiled. Code
 * extensions are deliberately absent — those belong to Vite's module graph,
 * which this must not reach into. */
const ASSET_EXT =
	/\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|ico|bmp|mp4|webm|ogg|mp3|wav|pdf)$/i;

/**
 * A missing static asset must 404, not answer with the app shell.
 *
 * Vite's history fallback rewrites any unmatched path to `index.html`, which is
 * right for routes and wrong for files: a font that isn't there arrives as 200
 * `text/html`, so the browser reports a decode failure with no hint that the
 * path was simply wrong, and a status-code smoke test passes while the page is
 * broken.
 *
 * Deliberately narrow. It runs before Vite's own middlewares, so it only ever
 * answers for a bare path with a static-asset extension that is genuinely not
 * on disk — no query string (an import carries `?raw`/`?url`), nothing under a
 * Vite-owned prefix, and a real file always falls through to be served.
 */
function missingAssetGuard(publicDir: string | null): import('vite').Plugin {
	return {
		name: 'sdocs:missing-asset-404',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url ?? '';
				if (url.includes('?')) return next();
				if (/^\/(?:@|node_modules\/|\.vite\/)/.test(url)) return next();
				if (!ASSET_EXT.test(url)) return next();
				if (publicDir && existsSync(join(publicDir, decodeURIComponent(url)))) return next();
				res.statusCode = 404;
				res.setHeader('Content-Type', 'text/plain');
				res.end(`Not found: ${url}\n`);
			});
		},
	};
}

/**
 * Say so when the config changes.
 *
 * It is read once at startup, and every failure that follows an edit looks
 * like something else: the new `css` never loads, a new section 404s, the port
 * setting appears ignored. Restarting automatically would drop the page you
 * were on and any running MCP session, so this only names what happened.
 */
function watchConfig(server: import('vite').ViteDevServer, cwd: string): void {
	const configPath = findConfigFile(cwd);
	if (!configPath) return;
	server.watcher.add(configPath);
	let announced = false;
	server.watcher.on('change', (file) => {
		if (resolve(file) !== resolve(configPath) || announced) return;
		// Once per run: editors write repeatedly, and a line per keystroke-save
		// would bury the message it is trying to deliver.
		announced = true;
		console.log(
			`\n[sdocs] ${basename(configPath)} changed — restart the dev server to apply it.\n`,
		);
	});
}
