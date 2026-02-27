import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { preview } from 'vite';
import { loadConfig } from '../server/config.js';
export async function previewCommand() {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const distDir = resolve(cwd, 'dist');
    if (!existsSync(distDir)) {
        console.error('[sdocs] No dist/ folder found. Run `sdocs build` first.');
        process.exit(1);
    }
    console.log('[sdocs] Serving built site...');
    const server = await preview({
        configFile: false,
        build: {
            outDir: distDir,
        },
        preview: {
            port: config.port,
            open: config.open,
        },
    });
    server.printUrls();
}
