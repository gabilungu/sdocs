import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SdocsConfig, ResolvedSdocsConfig } from '../types.js';

const CONFIG_NAMES = ['sdocs.config.ts', 'sdocs.config.mjs', 'sdocs.config.js'];

const DEFAULTS: ResolvedSdocsConfig = {
	include: ['./src/**/*.sdoc'],
	port: 3000,
	open: false,
	css: null,
	static: null,
	title: 'sdocs',
	logo: 'sdocs',
	sections: [],
	defaultSection: 'Docs',
	routing: null,
	sidebar: {
		order: {},
		open: [],
	},
	content: {
		page: { maxWidth: '1200px', padding: '32px', toc: true, contentX: 'left' },
		docs: {
			maxWidth: '1200px',
			padding: '16px',
			direction: 'row',
			gap: '16px',
			contentX: 'left',
			contentY: 'top',
		},
		layout: { maxWidth: '100%', padding: '0px' },
	},
};

/** Find the config file path in the given directory */
export function findConfigFile(root: string): string | null {
	for (const name of CONFIG_NAMES) {
		const fullPath = resolve(root, name);
		if (existsSync(fullPath)) return fullPath;
	}
	return null;
}

/** Resolve include glob patterns to absolute paths */
function resolveIncludePatterns(patterns: string[], root: string): string[] {
	return patterns.map((p) => (p.startsWith('/') ? p : resolve(root, p)));
}

/** Resolve CSS paths to absolute filesystem paths */
function resolveCssPaths(
	css: string | Record<string, string> | null,
	root: string,
): string | Record<string, string> | null {
	if (!css) return null;
	if (typeof css === 'string') {
		return css.startsWith('/') || css.startsWith('http') ? css : resolve(root, css);
	}
	const resolved: Record<string, string> = {};
	for (const [name, href] of Object.entries(css)) {
		resolved[name] = href.startsWith('/') || href.startsWith('http') ? href : resolve(root, href);
	}
	return resolved;
}

/** Load the raw config from file (unresolved) */
export async function loadRawConfig(root: string): Promise<SdocsConfig> {
	const configPath = findConfigFile(root);
	if (!configPath) return {};
	return importConfig(configPath);
}

/** Load and resolve the sdocs config with defaults */
export async function loadConfig(root: string): Promise<ResolvedSdocsConfig> {
	const rawConfig = await loadRawConfig(root);
	return resolveAndFinalize(rawConfig, root);
}

/** Resolve config and finalize paths */
export function resolveAndFinalize(userConfig: SdocsConfig, root: string): ResolvedSdocsConfig {
	const resolved = resolveConfig(userConfig);
	resolved.include = resolveIncludePatterns(resolved.include, root);
	resolved.css = resolveCssPaths(resolved.css, root);
	if (resolved.static) resolved.static = resolve(root, resolved.static);
	return resolved;
}

/** Import a config file (.js/.mjs; .ts only on Node with native type stripping) */
async function importConfig(configPath: string): Promise<SdocsConfig> {
	// Use dynamic import with file:// URL for ESM compatibility
	const mod = await import(pathToFileURL(configPath).href);
	return mod.default ?? mod;
}

/** Merge user config with defaults */
export function resolveConfig(userConfig: SdocsConfig): ResolvedSdocsConfig {
	const include = userConfig.include
		? Array.isArray(userConfig.include)
			? userConfig.include
			: [userConfig.include]
		: DEFAULTS.include;

	// Pre-0.0.61 configs: `logo` was the header text and `icon` the image.
	// An `icon` key marks the old shape — map it onto the new keys and warn.
	const legacy = userConfig as SdocsConfig & { icon?: string | false };
	const isLegacy = 'icon' in legacy;
	if (isLegacy) {
		console.warn(
			"[sdocs] config `icon` was renamed: use `logo` for the image and `title` for the header text.",
		);
	}
	const title =
		userConfig.title ?? (isLegacy && typeof legacy.logo === 'string' ? legacy.logo : undefined);
	const logo = isLegacy ? legacy.icon : userConfig.logo;

	return {
		include,
		port: userConfig.port ?? DEFAULTS.port,
		open: userConfig.open ?? DEFAULTS.open,
		css: userConfig.css ?? DEFAULTS.css,
		static: userConfig.static ?? DEFAULTS.static,
		title: title ?? DEFAULTS.title,
		logo: logo ?? DEFAULTS.logo,
		sections: userConfig.sections ?? DEFAULTS.sections,
		defaultSection: userConfig.defaultSection ?? DEFAULTS.defaultSection,
		routing: userConfig.routing ?? DEFAULTS.routing,
		sidebar: {
			order: userConfig.sidebar?.order ?? DEFAULTS.sidebar.order,
			open: userConfig.sidebar?.open ?? DEFAULTS.sidebar.open,
		},
		content: {
			page: { ...DEFAULTS.content.page, ...userConfig.content?.page },
			docs: { ...DEFAULTS.content.docs, ...userConfig.content?.docs },
			layout: { ...DEFAULTS.content.layout, ...userConfig.content?.layout },
		},
	};
}
