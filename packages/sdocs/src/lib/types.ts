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
	/** Where `sdocs build` writes the site. Default `'dist'`. The build empties
	 * this directory first, so point it somewhere of its own when the project
	 * already builds something to `dist/`. */
	outDir?: string;
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
	sections?: SectionEntry[];
	/** Route path of the landing page (e.g. 'guides/introduction'). Must
	 * resolve to an entity; when absent the root shows the About page. */
	home?: string;
	/** URL style: 'history' for real paths (default in the standalone CLI,
	 * needs the server to fall back to the shell), 'hash' for #/ URLs
	 * (default when embedding — works under any host routing). */
	routing?: 'history' | 'hash';
	/** Public base path the built site is served under, e.g. '/my-project/' for a
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
	/** A continuous knob — a top-bar slider whose value lands on every preview
	 * as a CSS custom property. The one dimension that isn't a set of names. */
	scale?: ScaleConfig;

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

/**
 * A continuous customization knob, rendered as a slider.
 *
 * Where an axis names its values, this one has a range, so it carries a CSS
 * custom property rather than an attribute: `--scale: 1.25` is a number the
 * project's css can multiply by, where `data-scale="1.25"` would need a rule
 * per step. sdocs sets the property and nothing else — what it scales is the
 * project's to define.
 */
export interface ScaleConfig {
	/** Lowest value the slider reaches. Default: 0.75 */
	min?: number;
	/** Highest value the slider reaches. Default: 1.5 */
	max?: number;
	/** Where the slider starts, and what "reset" returns to. Default: 1 */
	default?: number;
	/** Slider increment. Default: 0.05 */
	step?: number;
	/** The custom property set on each preview root. Default: '--scale' */
	var?: string;
	/** Control label. Default: 'Scale' */
	label?: string;
	/** Named stops, rendered as a segmented control beside the slider. Each
	 * sets the slider to its value; the slider still reaches everything
	 * between. Values must fall inside `min`–`max`. */
	presets?: ScalePreset[];
}

/** One named stop on the scale. */
export interface ScalePreset {
	/** Button text — short, since these sit in the top bar ('S', 'Compact'). */
	label: string;
	/** What the slider is set to. */
	value: number;
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
	/** Resolved form only — a divider entry followed this section, so the bar
	 * draws a rule after its tab. Authors write `{ type: 'divider' }` in the
	 * array instead; it survives here because the resolved sections are what
	 * the generated app hands back to the Explorer. */
	dividerAfter?: boolean;
}

/** A rule between two groups of tabs, written in the `sections` array as
 * `{ type: 'divider' }`. It has no routes, no sidebar and no title — it only
 * separates the tabs around it. */
export interface SectionDivider {
	type: 'divider';
}

/** What the `sections` array holds: sections, and rules between them. */
export type SectionEntry = SectionConfig | SectionDivider;

/** A section with every default filled in, as both the config loader and the
 * Explorer's section builder produce it. */
export interface NormalizedSection {
	slug: string;
	title: string;
	order: string[];
	/** A divider follows this section in the bar. */
	dividerAfter: boolean;
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
	/** The config named a port. Dev then holds it rather than sliding to the
	 * next free one, so a stale server on that port is an error you can see
	 * instead of a second server you don't know you're talking to. */
	portDeclared: boolean;
	open: boolean;
	css: string | Record<string, string> | null;
	static: string | null;
	outDir: string;
	title: string;
	logo: string | false;
	/** Favicon href for the built page; the built-in sdocs icon by default. */
	favicon: string;
	sections: NormalizedSection[];
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
	/** The scale slider, normalized; null when unconfigured or unusable. */
	scale: Required<ScaleConfig> | null;
	content: {
		doc: Required<ContentSizing> & { toc: boolean; contentX: string };
		page: Required<ContentSizing> & { contentX: string };
		showcase: Required<ContentSizing> & { direction: string; gap: string; contentX: string; contentY: string; background: string | null; minHeight: string | null };
		layout: Required<ContentSizing> & { background: string | null; minHeight: string | null };
	};
}

/**
 * What a note says about the thing it is attached to. Absent is a plain
 * remark, shown in grey.
 *
 * An **observation**, not a lifecycle stage — where a component sits in its
 * life is `status` on the `[COMPONENT]`, which is a property of the thing
 * rather than a remark about it. A note says what someone should know.
 *
 * `a11y` and `perf` name the two problems worth calling out by kind rather
 * than by severity: both are defects a reader triages differently from an
 * ordinary bug, and both come up often enough in component docs to earn a
 * word. They are the exception to "the vocabulary is one axis" — see
 * NOTE_TYPE_ORDER for where they sit and why.
 */
export type NoteType = 'bug' | 'a11y' | 'warning' | 'perf' | 'tip' | 'info';

/**
 * Where a `[COMPONENT]` sits in its life — a property of the component, not a
 * remark about it, which is what `[NOTES]` is for.
 *
 * One linear path, `draft` through `ready`, plus `deprecated` at the end of
 * it. `experimental` and `review` are both "not final", and the difference is
 * who they wait on: a review waits on a person, an experiment waits on real
 * use.
 */
export type ComponentStatus =
	| 'draft'
	| 'wip'
	| 'review'
	| 'experimental'
	| 'ready'
	| 'deprecated';

/** One line of a `[NOTES]` block. */
export interface DocNote {
	/** What the note says. */
	note: string;
	/** Its status; absent is a plain remark, shown in grey. */
	type: NoteType | null;
}

/** One `- Term: definition` line of a `[GLOSSARY]`. */
export interface GlossaryTerm {
	/** The word being defined. */
	term: string;
	/** What it means — inline markdown, rendered. */
	definition: string;
}

/**
 * One `[GLOSSARY]` block: a titled list of terms, rendered where it was
 * written.
 *
 * Unlike the other text blocks it carries attributes, which is why its tag is
 * matched uppercase-only — an attribute-bearing tag cannot use the
 * "nothing else on the line" rule that keeps `[notes](…)` a markdown link.
 */
export interface GlossaryBlock {
	/** Heading above the list; absent renders no heading. */
	title: string | null;
	/** A line under the title; absent renders nothing. */
	subtitle: string | null;
	/** Show a filter box over the terms. Off unless the author asks: a
	 * search over four terms is furniture, not a feature. */
	search: boolean;
	terms: GlossaryTerm[];
}

/** One line of a `[TODO]` block, with whatever is nested under it. */
export interface TodoItem {
	/** The item's text — inline markdown, rendered. */
	text: string;
	/** Ticked in the source (`- [x]`). */
	done: boolean;
	/** Items indented under this one; nesting has no depth limit. */
	children: TodoItem[];
}

/**
 * One item in a [SHOWCASE]'s body, in the order it was written — the tab strip
 * its [COMPONENT] blocks share, one [EXAMPLE], or one [PROSE] block. Indices
 * point into the entry's own `previews` / `examples` / `prose` arrays.
 */
export type FlowItem =
	| { kind: 'components'; indices: number[] }
	| { kind: 'example'; index: number }
	| { kind: 'prose'; index: number }
	| { kind: 'glossary'; index: number };

/** One [PROSE] block of a [SHOWCASE], compiled as its own component. */
export interface ProseBlock {
	/** Key into `pageModules` from `virtual:sdocs`. */
	key: string;
}

/** Entity metadata from a [SHOWCASE]/[DOC]/[PAGE]/[LAYOUT] opener */
export interface SdocMeta {
	/** Sidebar path (e.g. 'Demo / Button') */
	title: string;
	/** Short description */
	description?: string;
	/** Standing remarks about this entity, shown with it and marked in the
	 * sidebar. */
	notes?: DocNote[];
	/** The entity's [TODO] checklist. */
	todos?: TodoItem[];
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
	/** The component's own description, from its `<!-- @component -->` comment
	 * — Svelte's convention for documenting a component, which editors already
	 * show on hover. Null when the file has none. */
	description?: string | null;
	/** That description rendered to HTML. The Svelte docs allow markdown and
	 * code blocks inside an `@component` comment, so it goes through the same
	 * pipeline a [DOC] body does rather than an inline-only renderer. */
	descriptionHtml?: string;
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
	role: 'preview' | 'example' | 'content' | 'prose';
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
	/** An `[example]`'s tags="…": the parts or contexts it shows. Rendered
	 * under the description, and searched by the MCP server. */
	tags?: string[];
	/** A `[component]`'s synonyms="…": other names the component answers to.
	 * Rendered above its preview, and searched by the MCP server. */
	synonyms?: string[];
	/** A `[COMPONENT]`'s status="…", shown as a glyph on its tab. */
	status?: ComponentStatus;
	/** An `[EXAMPLE]`'s [NOTES], shown under its title. */
	notes?: DocNote[];
	/** An `[EXAMPLE]`'s [TODO] checklist. */
	todos?: TodoItem[];
	/** An `[EXAMPLE]`'s [PROSE], rendered to HTML. Markdown only — the
	 * Svelte islands a [SHOWCASE]'s prose can carry would have to compile,
	 * and an example's prose is a caption, not a page. */
	proseHtml?: string;
	/** False when the `[example]` opener says `code="false"` — its code panel
	 * is not rendered. Absent means it is. */
	showCode?: boolean;
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
	kind: 'component' | 'pattern' | 'doc' | 'page' | 'layout';
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
	/** A [SHOWCASE]'s [PROSE] blocks, in source order. Each compiles natively
	 * like a [DOC] body — markdown, code fences, and Svelte islands — and is
	 * keyed into `pageModules` by `key`. */
	prose: ProseBlock[];
	/** What a [SHOWCASE] shows, in source order. Absent on other kinds. */
	flow?: FlowItem[];
	/** The entity's [GLOSSARY] blocks, in source order. In a [DOC] these are
	 * spliced into the prose at the position they were written, the way an
	 * example is. */
	glossaries?: GlossaryBlock[];
	/** Explicit route leaf from slug="…"; the slugified title segment otherwise */
	routeSlug?: string;
	/** `hide` flag: routable but never listed in a sidebar */
	hide?: boolean;
}
