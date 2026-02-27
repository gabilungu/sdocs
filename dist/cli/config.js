var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
const CONFIG_FILES = ['sdocs.config.js', 'sdocs.config.mjs', 'sdocs.config.ts'];
const DEFAULTS = {
    include: ['./src/**/*.docs.{svelte,svx}'],
    port: 5174,
    open: false,
    css: '',
    options: {},
};
export async function loadConfig(cwd = process.cwd()) {
    for (const filename of CONFIG_FILES) {
        const filepath = resolve(cwd, filename);
        if (existsSync(filepath)) {
            try {
                const mod = await import(__rewriteRelativeImportExtension(pathToFileURL(filepath).href, true));
                const userConfig = mod.default ?? mod;
                return { ...DEFAULTS, ...userConfig };
            }
            catch (err) {
                console.warn(`[sdocs] Failed to load ${filename}:`, err);
            }
        }
    }
    return { ...DEFAULTS };
}
