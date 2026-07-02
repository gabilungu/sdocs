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
	/** Sidebar configuration */
	sidebar?: {
		/** Per-folder sort overrides. Keys are folder paths, 'root' for top level. '*' = unlisted items. */
		order?: Record<string, string[]>;
		/** Folders expanded by default on load. */
		open?: string[];
	};
}

/** Resolved config with all defaults applied */
export interface ResolvedSdocsConfig {
	include: string[];
	port: number;
	open: boolean;
	css: string | Record<string, string> | null;
	logo: string;
	sidebar: {
		order: Record<string, string[]>;
		open: string[];
	};
}

/** Meta extracted from a .sdoc file */
export interface SdocMeta {
	/** The Svelte component being documented */
	component?: unknown;
	/** Sidebar path (e.g. 'Demo / Button') */
	title: string;
	/** Short description */
	description?: string;
	/** Default prop values */
	args?: Record<string, unknown>;
	/** Preview settings (padding, background, etc.) */
	settings?: Record<string, unknown>;
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

/** An extracted snippet */
export interface ExtractedSnippet {
	name: string;
	body: string;
	highlightedHtml?: string;
	/** Preview URL for iframe (added by virtual module) */
	previewUrl?: string;
}

/** A table of contents heading (for pages) */
export interface TocHeading {
	text: string;
	level: number;
	id: string;
}

/** A complete doc entry (one .sdoc file) */
export interface DocEntry {
	/** Doc kind */
	kind: 'component' | 'page' | 'layout';
	/** Absolute path to the .sdoc file */
	filePath: string;
	/** Absolute path to the documented component */
	componentPath: string | null;
	/** Parsed meta */
	meta: SdocMeta;
	/** Parsed component data (props, methods, state, CSS props) */
	componentData: ComponentData | null;
	/** Extracted snippets */
	snippets: ExtractedSnippet[];
	/** Highlighted component source HTML */
	highlightedSource: string | null;
	/** Table of contents headings (pages only) */
	toc?: TocHeading[];
}
