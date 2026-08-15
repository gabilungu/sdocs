/** sdocs config file schema */
export interface SdocsConfig {
	/** Glob pattern(s) to find sdoc files. Default: ['./src/**\/*.sdoc'] */
	include?: string | string[];
	/** Dev server port. Default: 3000 */
	port?: number;
	/** Open browser on start. Default: false */
	open?: boolean;
	/** CSS loaded in preview iframes. Single path or named stylesheets. */
	css?: string | Record<string, string>;
	/** Folder of static assets served at the site root — images for pages,
	 * files for previews. Standalone CLI flows (`sdocs dev`/`build`); when
	 * embedding the Vite plugin, use the host app's own public directory. */
	static?: string;
	/** Header title text. Default: 'sdocs' */
	title?: string;
	/** Header logo: 'sdocs' for the built-in mascot, an image URL, or false to hide. Default: 'sdocs' */
	logo?: string | false;
	/** Browser-tab favicon — a path (e.g. '/logo.svg' from the static folder)
	 * or URL. Default: the built-in sdocs icon. */
	favicon?: string;
	/** The site's sections, in top-bar order. Titles reference a section by
	 * its slug (`title="@guides/…"`); an unknown slug is an error. When
	 * absent, a single implicit `docs` section exists and no top bar renders. */
	sections?: SectionConfig[];
	/** Route path of the landing page (e.g. 'guides/introduction'). Must
	 * resolve to an entity; when absent the root shows the About page. */
	home?: string;
	/** URL style: 'history' for real paths (default in the standalone CLI,
	 * needs the server to fall back to the shell), 'hash' for #/ URLs
	 * (default when embedding — works under any host routing). */
	routing?: 'history' | 'hash';
	/** Public base path the built site is served under, e.g. '/gabi/' for a
	 * GitHub project Pages site. Applies to `sdocs build` only — `sdocs dev`
	 * always serves at the root. Default: '/'. */
	base?: string;
	/** Serve the MCP server while `sdocs dev` runs (the /mcp endpoint and the
	 * top-bar MCP button). Default: true. The explicit `sdocs mcp` command is
	 * unaffected; built sites never carry an MCP endpoint. */
	mcp?: boolean;
	/** Glob(s) locating the components documentation coverage is measured
	 * against (`sdocs coverage`, the MCP `check_coverage` tool). Defaults to
	 * the `include` globs with `.sdoc` swapped for `.svelte` — right when docs
	 * sit next to their components; set it when they don't. */
	components?: string | string[];
	/** Design-system dimensions the reader can switch between — theme, density,
	 * palette, whatever the project's css keys off. Each becomes a top-bar
	 * dropdown, and the selection lands on every preview as `data-<id>`. */
	axes?: AxisConfig[];

	/** Content presentation per entity kind; entity/block attributes override these. */
	content?: {
		/** [DOC] content. Defaults: maxWidth '1200px', padding '32px', toc true. */
		doc?: ContentSizing & {
			/** Show the table of contents. Default: true */
			toc?: boolean;
			/** Horizontal alignment of the content column (with its toc) inside
			 * the view: 'left'|'center'|'right'. Default: 'left' */
			contentX?: string;
		};
		/** [PAGE] content: the Svelte body renders inside a centered-capable
		 * container. Defaults: maxWidth '1200px', padding '32px'. */
		page?: ContentSizing & {
			/** Horizontal alignment of the content container inside the view:
			 * 'left'|'center'|'right'. Default: 'left' */
			contentX?: string;
		};
		/** [SHOWCASE] pages: maxWidth is the content column (default '1200px');
		 * padding/direction/gap are the default preview/example stage layout
		 * (defaults '16px', 'row', '16px'). */
		showcase?: ContentSizing & {
			/** Stage flex-direction. Default: 'row' */
			direction?: string;
			/** Stage gap. Default: '16px' */
			gap?: string;
			/** Stage background — a CSS color or a var() from the project's css. Default: none */
			background?: string;
			/** Minimum stage height — any CSS length. Reserves room for content that
			 * overflows the stage, like an open dropdown. Default: none */
			minHeight?: string;
			/** Horizontal alignment of stage contents: 'left'|'center'|'right'|'justify'. Default: 'left' */
			contentX?: string;
			/** Vertical alignment of stage contents: 'top'|'middle'|'bottom'. Default: 'top' */
			contentY?: string;
		};
		/** [LAYOUT] stages. Defaults: maxWidth '100%', padding '0px'. */
		layout?: ContentSizing & {
			/** Stage background — a CSS color or a var() from the project's css. Default: none */
			background?: string;
			/** Minimum stage height — any CSS length. Default: none */
			minHeight?: string;
		};
	};
}

/** One axis of design-system customization.
 *
 * sdocs stays ignorant of what an axis *means*: it renders the control and
 * writes `data-<id>="<value>"` onto each preview's `<html>`. The project's own
 * css supplies the meaning — `[data-density="compact"] { --space-md: 8px }`.
 * That's what lets a project declare any axes it likes without sdocs knowing
 * the vocabulary. */
export interface AxisConfig {
	/** Attribute name (minus the `data-` prefix) and storage key. Lowercase,
	 * dash-separated; `sdocs-` is reserved for the stage's own attributes. */
	id: string;
	/** Control label. Default: the capitalized id. */
	label?: string;
	/** Selectable values, in control order. The first is the default. */
	values: string[];
}

/** One top-bar section. */
export interface SectionConfig {
	/** URL-safe identity — the first route segment and the `@slug/` titles use. */
	slug: string;
	/** Tab label. Default: the capitalized slug. */
	title?: string;
	/** Sidebar ordering: route paths relative to the section. Listed items
	 * sort first at their level; the rest follow alphabetically. */
	order?: string[];
}

/** Content sizing knobs (any CSS length; padding takes CSS shorthand) */
export interface ContentSizing {
	maxWidth?: string;
	padding?: string;
}

/** Resolved stage layout applied inside a preview iframe */
export interface StageLayout {
	maxWidth: string;
	padding: string;
	/** flex-direction + gap + contentX; set for preview/example stages only */
	direction?: string;
	gap?: string;
	/** horizontal ('left'|'center'|'right'|'justify') — mapped by direction */
	contentX?: string;
	/** vertical ('top'|'middle'|'bottom') — mapped by direction */
	contentY?: string;
	background?: string;
	/** minimum stage height — reserves room for overflowing content */
	minHeight?: string;
}

/** Resolved config with all defaults applied */
export interface ResolvedSdocsConfig {
	include: string[];
	port: number;
	open: boolean;
	css: string | Record<string, string> | null;
	static: string | null;
	title: string;
	logo: string | false;
	/** Favicon href for the built page; the built-in sdocs icon by default. */
	favicon: string;
	sections: Required<SectionConfig>[];
	/** True when the config declared sections (drives strict validation + top bar) */
	sectionsDeclared: boolean;
	home: string | null;
	/** null = per-mode default (standalone: history, embedded: hash) */
	routing: 'history' | 'hash' | null;
	/** Normalized public base path for the build (leading + trailing slash). */
	base: string;
	/** Serve the MCP server (endpoint + top-bar button) in dev. */
	mcp: boolean;
	/** Globs locating component sources, for documentation coverage. */
	components: string[];
	/** Customization axes, normalized: valid ids, labels filled, 2+ values. */
	axes: Required<AxisConfig>[];
	content: {
		doc: Required<ContentSizing> & { toc: boolean; contentX: string };
		page: Required<ContentSizing> & { contentX: string };
		showcase: Required<ContentSizing> & { direction: string; gap: string; contentX: string; contentY: string; background: string | null; minHeight: string | null };
		layout: Required<ContentSizing> & { background: string | null; minHeight: string | null };
	};
}

/** Entity metadata from a [SHOWCASE]/[DOC]/[PAGE]/[LAYOUT] opener */
export interface SdocMeta {
	/** Sidebar path (e.g. 'Demo / Button') */
	title: string;
	/** Short description */
	description?: string;
}

/** A parsed prop */
export interface ParsedProp {
	name: string;
	type: string | null;
	default: string | null;
	description: string | null;
	required: boolean;
	category: 'prop' | 'event' | 'snippet';
}

/** An exported function */
export interface ParsedMethod {
	name: string;
	params: string;
	returnType: string | null;
	description: string | null;
}

/** An exported state value */
export interface ParsedState {
	name: string;
	type: string | null;
	description: string | null;
}

/** A CSS custom property */
export interface ParsedCssProp {
	name: string;
	type: string | null;
	default: string | null;
	/** Set when var() fallbacks diverge across properties ("Mixed"): the
	 * per-property breakdown, in source order. */
	defaultUses?: { property: string; value: string }[];
	description: string | null;
}

/** All parsed data from a component */
export interface ComponentData {
	props: ParsedProp[];
	methods: ParsedMethod[];
	state: ParsedState[];
	cssProps: ParsedCssProp[];
	/** The component accepts `class` and merges it onto its root element.
	 * Shown as a chip under the props, never as a prop row. */
	acceptsClass?: boolean;
	/** The component spreads `...rest` onto its root element. */
	forwardsRest?: boolean;
	/** What the rest props are typed as, when the Props interface extends a
	 * type (e.g. `HTMLButtonAttributes`); null for untyped/JSDoc components. */
	restType?: string | null;
	/** Why extraction came back thinner than the source looks. An empty `props`
	 * is otherwise indistinguishable from a component that genuinely has none,
	 * and the difference is a published page with an empty API table. */
	warnings?: string[];
}

/** A renderable snippet of an entity: a preview, an example, or the body */
export interface ExtractedSnippet {
	/** Display name: preview label / example title / 'Content' */
	name: string;
	/** URL-safe id, unique within the entity */
	slug: string;
	role: 'preview' | 'example' | 'content';
	/** Full body — block script/style included (what the code panel shows) */
	body: string;
	/** Markup between the block script and style (what the stage renders) */
	markup?: string;
	/** Block-level <script> content, when the block declares one */
	script?: string | null;
	/** Block-level <style> content, when the block declares one */
	style?: string | null;
	/** Short text rendered with the block (description="…" on the opener) */
	description?: string | null;
	highlightedHtml?: string;
	/** Preview URL for iframe (added by virtual module) */
	previewUrl?: string;
	/** Short stable handle for this stage — readable, quotable, and the thing
	 * the MCP server resolves back to a preview URL and a source file. */
	stageId?: string;
	/** For a [component] preview: the component reference it demonstrates */
	componentName?: string | null;
	/** Resolved stage layout applied inside the iframe (config → entity → block) */
	stage?: StageLayout;
}

/** One [preview] of a SHOWCASE entity: a live showcase of one component */
export interface PreviewEntry {
	/** Tab label (title override or the component name) */
	label: string;
	/** The previewed component's identifier in the file's script */
	componentName: string | null;
	/** Absolute path to the previewed component */
	componentPath: string | null;
	/** Parsed component data (props, methods, state, CSS props) */
	componentData: ComponentData | null;
	/** Highlighted component source HTML */
	highlightedSource: string | null;
	/** Control defaults for this preview. The parser only admits plain
	 * literals, so these are always serializable — which is what lets them
	 * seed the generated stage's initial state. */
	args: Record<string, string | number | boolean | null>;
	snippet: ExtractedSnippet;
}

/** A table of contents heading (for docs) */
export interface TocHeading {
	text: string;
	level: number;
	id: string;
}

/** A complete doc entry (one entity of one .sdoc file) */
export interface DocEntry {
	/** Doc kind: SHOWCASE / DOC / PAGE / LAYOUT */
	kind: 'component' | 'doc' | 'page' | 'layout';
	/** Absolute path to the .sdoc file */
	filePath: string;
	/** URL-safe entity id, unique within the file */
	entitySlug: string;
	/** Entity metadata (title drives the sidebar) */
	meta: SdocMeta;
	/** Entity-level <script> content — shared by every block of this entity */
	entityScript?: string | null;
	/** Entity-level <style> content — joins the entity's stage css */
	entityStyle?: string | null;
	/** Live previews (component kind; empty otherwise) */
	previews: PreviewEntry[];
	/** Frozen examples (component and doc kinds; empty otherwise) */
	examples: ExtractedSnippet[];
	/** The body (doc/page/layout kind; null otherwise) */
	content: ExtractedSnippet | null;
	/** Table of contents headings (doc kind only) */
	toc?: TocHeading[];
	/** Resolved content-column max width (component, doc, and page kinds) */
	maxWidth?: string;
	/** Resolved view padding (doc and page kinds) */
	padding?: string;
	/** Resolved horizontal alignment of the content column (doc and page kinds) */
	contentX?: string;
	/** Resolved table-of-contents visibility (doc kind only) */
	showToc?: boolean;
	/** The body's `#` heading, shown as the page title instead of the entity
	 * title (doc kind only) */
	bodyTitle?: string;
	/** Key into the virtual module's pageModules map (doc and page kinds) */
	contentKey?: string;
	/** Explicit route leaf from slug="…"; the slugified title segment otherwise */
	routeSlug?: string;
	/** `hide` flag: routable but never listed in a sidebar */
	hide?: boolean;
}
