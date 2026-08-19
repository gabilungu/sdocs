import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SdocsConfig, ResolvedSdocsConfig, SectionConfig, AxisConfig } from '../types.js';

const CONFIG_NAMES = ['sdocs.config.ts', 'sdocs.config.mjs', 'sdocs.config.js'];

const DEFAULTS: ResolvedSdocsConfig = {
	include: ['./src/**/*.sdoc'],
	port: 3000,
	open: false,
	css: null,
	static: null,
	title: 'sdocs',
	logo: 'sdocs',
	favicon: './explorer/favicon.png',
	sections: [{ slug: 'docs', title: 'Docs', order: [] }],
	sectionsDeclared: false,
	home: null,
	routing: null,
	base: '/',
	mcp: true,
	components: [],
	axes: [],
	content: {
		doc: { maxWidth: '1200px', padding: '32px', toc: true, contentX: 'left' },
		page: { maxWidth: '1200px', padding: '32px', contentX: 'left' },
		showcase: {
			maxWidth: '1200px',
			padding: '16px',
			direction: 'row',
			gap: '16px',
			contentX: 'left',
			contentY: 'top',
			background: null,
			minHeight: null,
		},
		layout: { maxWidth: '100%', padding: '0px', background: null, minHeight: null },
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
/** Component globs for coverage: the configured value, or the include globs
 * with `.sdoc` swapped for `.svelte` (docs commonly sit beside components). */
function normalizeComponents(
	components: string | string[] | undefined,
	include: string[],
): string[] {
	if (components) return Array.isArray(components) ? components : [components];
	return include.map((p) => p.replace(/\.sdoc$/, '.svelte'));
}

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

/** Resolve config and finalize paths. Accepts an already-resolved config
 * too — resolution is idempotent, every field passes through unchanged. */
export function resolveAndFinalize(
	userConfig: SdocsConfig | ResolvedSdocsConfig,
	root: string,
): ResolvedSdocsConfig {
	const resolved = resolveConfig(userConfig);
	resolved.include = resolveIncludePatterns(resolved.include, root);
	resolved.components = resolveIncludePatterns(resolved.components, root);
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

/** Sections with defaults filled in; the implicit `docs` section when none
 * are declared. Slug validity and duplicates are checked at site validation. */
function normalizeSections(sections: SectionConfig[] | undefined): Required<SectionConfig>[] {
	if (!sections || sections.length === 0) return DEFAULTS.sections;
	return sections.map((s) => ({
		slug: String(s.slug ?? ''),
		title: s.title ?? capitalize(String(s.slug ?? '')),
		order: s.order ?? [],
	}));
}

function capitalize(s: string): string {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Customization axes with labels filled in, invalid ones dropped.
 *
 * Every rejection warns. An axis that silently vanished would show up as a
 * missing dropdown — or worse, as previews rendering unstyled because the
 * attribute the project's css keys off never arrives — and neither points back
 * at the line of config that caused it. */
function normalizeAxes(axes: AxisConfig[] | undefined): Required<AxisConfig>[] {
	if (!axes?.length) return [];
	const out: Required<AxisConfig>[] = [];
	const seen = new Set<string>();
	for (const axis of axes) {
		const id = String(axis?.id ?? '');
		const where = id ? `axis '${id}'` : 'an axis';
		if (!/^[a-z][a-z0-9-]*$/.test(id)) {
			console.warn(
				`[sdocs] ignoring ${where}: 'id' must be lowercase letters, digits and dashes, starting with a letter.`,
			);
			continue;
		}
		// data-sdocs-* carries the stage's own identity into the preview
		// document; an axis writing there would overwrite it.
		if (id.startsWith('sdocs-')) {
			console.warn(`[sdocs] ignoring ${where}: the 'sdocs-' prefix is reserved.`);
			continue;
		}
		if (seen.has(id)) {
			console.warn(`[sdocs] ignoring duplicate ${where}.`);
			continue;
		}
		const values = (axis.values ?? []).map(String).filter(Boolean);
		if (values.length < 2) {
			console.warn(`[sdocs] ignoring ${where}: it needs at least two values to switch between.`);
			continue;
		}
		seen.add(id);
		out.push({ id, label: axis.label ?? capitalize(id.replace(/-/g, ' ')), values });
	}
	return out;
}

/** The home route as bare segments ('guides/introduction'), or null. */
function normalizeHome(home: string | null | undefined): string | null {
	if (!home) return null;
	return home.replace(/^\/+|\/+$/g, '');
}

/** A public base path always has a leading and trailing slash: '/gabi/'. */
export function normalizeBase(base: string | undefined): string {
	if (!base || base === '/') return '/';
	return `/${base.replace(/^\/+|\/+$/g, '')}/`;
}

/** Merge user config with defaults */
export function resolveConfig(userConfig: SdocsConfig | ResolvedSdocsConfig): ResolvedSdocsConfig {
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
		favicon: userConfig.favicon ?? DEFAULTS.favicon,
		sections: normalizeSections(userConfig.sections),
		sectionsDeclared: (userConfig.sections?.length ?? 0) > 0,
		home: normalizeHome(userConfig.home),
		routing: userConfig.routing ?? DEFAULTS.routing,
		base: normalizeBase(userConfig.base),
		mcp: userConfig.mcp ?? DEFAULTS.mcp,
		// Coverage measures docs against these; without an explicit setting,
		// look for components wherever the docs live.
		components: normalizeComponents(userConfig.components, include),
		axes: normalizeAxes(userConfig.axes),
		content: {
			doc: { ...DEFAULTS.content.doc, ...userConfig.content?.doc },
			page: { ...DEFAULTS.content.page, ...userConfig.content?.page },
			showcase: { ...DEFAULTS.content.showcase, ...userConfig.content?.showcase },
			layout: { ...DEFAULTS.content.layout, ...userConfig.content?.layout },
		},
	};
}
