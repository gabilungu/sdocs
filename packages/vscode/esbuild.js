const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** The sdoc grammar's source of truth lives in the sdocs package. */
function copyGrammar() {
	const source = path.join(__dirname, '../sdocs/src/lib/grammar/sdoc.tmLanguage.json');
	const target = path.join(__dirname, 'syntaxes/sdoc.tmLanguage.json');
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(source, target);
}

/** The embedded svelte-language-server loads several things from DISK at
 * runtime; the installed extension has no node_modules, so ship them beside
 * the server bundle:
 * - 'svelte' (fallback compiler when the workspace has none)
 * - 'svelte2tsx' (its shim .d.ts files declare the __sveltets_2_* helpers)
 * - 'prettier' + 'prettier-plugin-svelte' (resolved inside getCompletions
 *   for TS format settings — without them every completion request throws)
 * - typescript's standard lib .d.ts files (both next to the bundle, where
 *   the bundled compiler's __dirname-based lookup lands, and as a package)
 * A workspace's own copy of each still wins; these are fallbacks. */
function copyRuntimeAssets() {
	for (const pkg of ['svelte', 'svelte2tsx', 'prettier', 'prettier-plugin-svelte']) {
		const target = path.join(__dirname, 'dist/node_modules', pkg);
		fs.rmSync(target, { recursive: true, force: true });
		fs.cpSync(path.join(__dirname, 'node_modules', pkg), target, {
			recursive: true,
			dereference: true,
		});
	}
	const tsLib = path.join(__dirname, 'node_modules/typescript/lib');
	const tsTarget = path.join(__dirname, 'dist/node_modules/typescript');
	fs.rmSync(tsTarget, { recursive: true, force: true });
	fs.mkdirSync(path.join(tsTarget, 'lib'), { recursive: true });
	fs.copyFileSync(
		path.join(__dirname, 'node_modules/typescript/package.json'),
		path.join(tsTarget, 'package.json'),
	);
	for (const file of fs.readdirSync(tsLib)) {
		if (/^lib\..*\.d\.ts$/.test(file) || file === 'lib.d.ts') {
			fs.copyFileSync(path.join(tsLib, file), path.join(tsTarget, 'lib', file));
			fs.copyFileSync(path.join(tsLib, file), path.join(__dirname, 'dist', file));
		}
	}
}

/**
 * Two resolution fixes for the server bundle:
 * - vscode-html/css-languageservice ship UMD mains whose AMD-style paths
 *   break as runtime requires once bundled — load their ESM builds instead.
 * - prettier's ESM entry needs import.meta.url (absent in a CJS bundle) —
 *   resolving through require() picks its CJS builds.
 */
const { createRequire } = require('node:module');
const UMD_OFFENDERS = /^(vscode-(html|css)-languageservice|prettier|jsonc-parser|@vscode\/emmet-helper)(\/|$)/;
const bundleResolveFixes = {
	name: 'bundle-resolve-fixes',
	setup(build) {
		build.onResolve({ filter: UMD_OFFENDERS, namespace: 'file' }, (args) => {
			try {
				const req = createRequire(path.join(args.resolveDir, 'noop.js'));
				const resolved = req.resolve(args.path);
				const esm = resolved.replace(`${path.sep}lib${path.sep}umd${path.sep}`, `${path.sep}lib${path.sep}esm${path.sep}`);
				return { path: esm !== resolved && fs.existsSync(esm) ? esm : resolved };
			} catch {
				return null;
			}
		});
	},
};

async function main() {
	copyGrammar();
	copyRuntimeAssets();
	const ctx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'info',
	});

	// The sdoc language server runs in its own node process; it bundles the
	// embedded svelte-language-server, prettier, and the sdoc projection.
	const serverCtx = await esbuild.context({
		entryPoints: ['src/server/main.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/server.js',
		logLevel: 'info',
		plugins: [bundleResolveFixes],
		inject: ['src/server/import-meta-url-shim.js'],
		define: { 'import.meta.url': 'import_meta_url' },
	});

	if (watch) {
		await ctx.watch();
		await serverCtx.watch();
		console.log('Watching for changes...');
	} else {
		await ctx.rebuild();
		await serverCtx.rebuild();
		await ctx.dispose();
		await serverCtx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
