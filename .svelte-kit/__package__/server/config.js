import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const CONFIG_NAMES = ['sdocs.config.ts', 'sdocs.config.mjs', 'sdocs.config.js'];
const DEFAULTS = {
    include: ['./src/**/*.sdoc'],
    port: 3000,
    open: false,
    css: null,
    logo: 'sdocs',
    sidebar: {
        order: {},
        open: [],
    },
};
/** Find the config file path in the given directory */
export function findConfigFile(root) {
    for (const name of CONFIG_NAMES) {
        const fullPath = resolve(root, name);
        if (existsSync(fullPath))
            return fullPath;
    }
    return null;
}
/** Resolve include glob patterns to absolute paths */
function resolveIncludePatterns(patterns, root) {
    return patterns.map((p) => (p.startsWith('/') ? p : resolve(root, p)));
}
/** Resolve CSS paths to absolute filesystem paths */
function resolveCssPaths(css, root) {
    if (!css)
        return null;
    if (typeof css === 'string') {
        return css.startsWith('/') || css.startsWith('http') ? css : resolve(root, css);
    }
    const resolved = {};
    for (const [name, href] of Object.entries(css)) {
        resolved[name] = href.startsWith('/') || href.startsWith('http') ? href : resolve(root, href);
    }
    return resolved;
}
/** Load and resolve the sdocs config with defaults */
export async function loadConfig(root) {
    const configPath = findConfigFile(root);
    if (!configPath)
        return { ...DEFAULTS };
    const userConfig = await importConfig(configPath);
    const resolved = resolveConfig(userConfig);
    resolved.include = resolveIncludePatterns(resolved.include, root);
    resolved.css = resolveCssPaths(resolved.css, root);
    return resolved;
}
/** Import a config file (supports .js, .mjs, .ts via Vite) */
async function importConfig(configPath) {
    // Use dynamic import with file:// URL for ESM compatibility
    const mod = await import(pathToFileURL(configPath).href);
    return mod.default ?? mod;
}
/** Merge user config with defaults */
export function resolveConfig(userConfig) {
    const include = userConfig.include
        ? Array.isArray(userConfig.include)
            ? userConfig.include
            : [userConfig.include]
        : DEFAULTS.include;
    return {
        include,
        port: userConfig.port ?? DEFAULTS.port,
        open: userConfig.open ?? DEFAULTS.open,
        css: userConfig.css ?? DEFAULTS.css,
        logo: userConfig.logo ?? DEFAULTS.logo,
        sidebar: {
            order: userConfig.sidebar?.order ?? DEFAULTS.sidebar.order,
            open: userConfig.sidebar?.open ?? DEFAULTS.sidebar.open,
        },
    };
}
