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
	/** Sidebar logo text. Default: 'sdocs' */
	logo?: string;
	/** Sidebar logo icon: 'sdocs' for the built-in mascot, an image URL, or false to hide. Default: 'sdocs' */
	icon?: string | false;
	/** Sidebar configuration */
	sidebar?: {
		/** Per-folder sort overrides. Keys are folder paths, 'root' for top level. '*' = unlisted items. */
		order?: Record<string, string[]>;
		/** Folders expanded by default on load. */
		open?: string[];
	};
	/** Content presentation per entity kind; entity/block attributes override these. */
	content?: {
		/** [PAGE] content. Defaults: maxWidth '1200px', padding '32px', toc true. */
		page?: ContentSizing & {
			/** Show the table of contents. Default: true */
			toc?: boolean;
		};
		/** [DOCS] pages: maxWidth is the content column (default '1200px');
		 * padding/direction/gap are the default preview/example stage layout
		 * (defaults '16px', 'row', '16px'). */
		docs?: ContentSizing & {
			/** Stage flex-direction. Default: 'row' */
			direction?: string;
			/** Stage gap. Default: '16px' */
			gap?: string;
			/** Horizontal alignment of stage contents: 'left'|'center'|'right'|'justify'. Default: 'left' */
			align?: string;
			/** Vertical alignment of stage contents: 'top'|'middle'|'bottom'. Default: 'top' */
			alignY?: string;
		};
		/** [LAYOUT] stages. Defaults: maxWidth '100%', padding '0px'. */
		layout?: ContentSizing;
	};
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
	/** flex-direction + gap + align; set for preview/example stages only */
	direction?: string;
	gap?: string;
	/** horizontal ('left'|'center'|'right'|'justify') — mapped by direction */
	align?: string;
	/** vertical ('top'|'middle'|'bottom') — mapped by direction */
	alignY?: string;
}

/** Resolved config with all defaults applied */
export interface ResolvedSdocsConfig {
	include: string[];
	port: number;
	open: boolean;
	css: string | Record<string, string> | null;
	logo: string;
	icon: string | false;
	sidebar: {
		order: Record<string, string[]>;
		open: string[];
	};
	content: {
		page: Required<ContentSizing> & { toc: boolean };
		docs: Required<ContentSizing> & { direction: string; gap: string; align: string; alignY: string };
		layout: Required<ContentSizing>;
	};
}

/** Entity metadata from a [DOCS]/[PAGE]/[LAYOUT] opener */
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
	description: string | null;
}

/** All parsed data from a component */
export interface ComponentData {
	props: ParsedProp[];
	methods: ParsedMethod[];
	state: ParsedState[];
	cssProps: ParsedCssProp[];
}

/** A renderable snippet of an entity: a preview, an example, or the body */
export interface ExtractedSnippet {
	/** Display name: preview label / example title / 'Content' */
	name: string;
	/** URL-safe id, unique within the entity */
	slug: string;
	role: 'preview' | 'example' | 'content';
	body: string;
	highlightedHtml?: string;
	/** Preview URL for iframe (added by virtual module) */
	previewUrl?: string;
	/** Resolved stage layout applied inside the iframe (config → entity → block) */
	stage?: StageLayout;
}

/** One [preview] of a DOCS entity: a live showcase of one component */
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
	/** Control defaults for this preview */
	args: Record<string, unknown>;
	snippet: ExtractedSnippet;
}

/** A table of contents heading (for pages) */
export interface TocHeading {
	text: string;
	level: number;
	id: string;
}

/** A complete doc entry (one entity of one .sdoc file) */
export interface DocEntry {
	/** Doc kind: DOCS / PAGE / LAYOUT */
	kind: 'component' | 'page' | 'layout';
	/** Absolute path to the .sdoc file */
	filePath: string;
	/** URL-safe entity id, unique within the file */
	entitySlug: string;
	/** Entity metadata (title drives the sidebar) */
	meta: SdocMeta;
	/** Live previews (component kind; empty otherwise) */
	previews: PreviewEntry[];
	/** Frozen examples (component kind; empty otherwise) */
	examples: ExtractedSnippet[];
	/** The rendered body (page/layout kind; null otherwise) */
	content: ExtractedSnippet | null;
	/** Table of contents headings (pages only) */
	toc?: TocHeading[];
	/** Resolved content-column max width (component and page kinds) */
	maxWidth?: string;
	/** Resolved table-of-contents visibility (pages only) */
	showToc?: boolean;
}
