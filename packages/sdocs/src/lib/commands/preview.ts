import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig } from '../server/config.js';
import { loadVite } from '../server/svelte-toolchain.js';

/**
 * The base path a built site was actually built with.
 *
 * `config.base` is the usual answer, but `sdocs build --base "/repo/"` sets it
 * from the command line, and preview has no way to know that was passed. The
 * built `index.html` does: every asset URL in it carries the prefix. Reading it
 * back means preview serves on the path the build assumed, whichever way the
 * base was set — without it a sub-path build previews as a blank page, because
 * the server answers `/` while the page asks for `/repo/assets/…`.
 */
function builtBase(distDir: string, fallback: string): string {
	try {
        const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
        const asset = /(?:src|href)="([^"]*\/assets\/)/.exec(html);
        if (!asset) return fallback;
        const prefix = asset[1].replace(/assets\/$/, '');
        return prefix.startsWith('/') ? prefix : fallback;
	} catch {
		return fallback;
	}
}

export interface PreviewOptions {
	/** `--port`, overriding the config's. */
	port?: number;
	/** `--open` / `--no-open`, overriding the config's. */
	open?: boolean;
}

export async function previewCommand(opts?: PreviewOptions): Promise<void> {
	const cwd = process.cwd();
	const { preview } = await loadVite(cwd);
	const config = await loadConfig(cwd);
	const distDir = resolve(cwd, config.outDir);

	if (!existsSync(distDir)) {
		console.error(`[sdocs] No ${config.outDir}/ folder found. Run \`sdocs build\` first.`);
		process.exit(1);
	}

	const base = builtBase(distDir, config.base ?? '/');
	console.log(
		base === '/'
			? '[sdocs] Serving built site...'
			: `[sdocs] Serving built site under ${base}...`,
	);

	const server = await preview({
		configFile: false,
		base,
		build: {
			outDir: distDir,
		},
		preview: {
			port: opts?.port ?? config.port,
			strictPort: opts?.port !== undefined,
			open: opts?.open ?? config.open,
		},
	});

	server.printUrls();
}
