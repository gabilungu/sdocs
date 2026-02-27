import { createServer } from 'vite';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { sdocsPlugin } from '../vite-plugin.js';
import { sdocsAppPlugin } from './app-plugin.js';
/**
 * Try to dynamically import mdsvex. Returns null if not installed.
 */
async function tryLoadMdsvex() {
    try {
        return await import('mdsvex');
    }
    catch {
        return null;
    }
}
export async function startServer(config) {
    const cwd = process.cwd();
    const mdsvexMod = await tryLoadMdsvex();
    const hasMdsvex = mdsvexMod !== null;
    // Import svelte vite plugin
    const { svelte } = await import('@sveltejs/vite-plugin-svelte');
    const svelteConfig = {
        extensions: hasMdsvex ? ['.svelte', '.svx'] : ['.svelte'],
        compilerOptions: {
            dev: true,
            css: 'injected',
        },
        // Don't auto-load svelte.config.js (avoids SvelteKit interference)
        configFile: false,
    };
    if (hasMdsvex) {
        svelteConfig.preprocess = [mdsvexMod.mdsvex({ extensions: ['.svx'] })];
    }
    // Resolve CSS path if configured
    let cssPath;
    if (config.css) {
        const resolved = resolve(cwd, config.css);
        if (existsSync(resolved)) {
            cssPath = resolved;
        }
        else {
            console.warn(`[sdocs] CSS file not found: ${config.css}`);
        }
    }
    const server = await createServer({
        root: cwd,
        // Prevent loading vite.config.ts from the user's project (which may have SvelteKit)
        configFile: false,
        plugins: [
            svelte(svelteConfig),
            sdocsPlugin({ include: config.include }),
            sdocsAppPlugin({ sdocsOptions: config.options, cssPath }),
        ],
        resolve: {
            alias: {
                $lib: resolve(cwd, 'src/lib'),
            },
        },
        server: {
            port: config.port,
            open: config.open,
        },
        // Custom app type — we serve HTML virtually, no index.html on disk
        appType: 'custom',
        optimizeDeps: {
            include: ['svelte', 'lucide-svelte'],
            exclude: ['sdocs'],
        },
    });
    await server.listen();
    server.printUrls();
    if (hasMdsvex) {
        console.log('  mdsvex detected — .svx files enabled');
    }
}
