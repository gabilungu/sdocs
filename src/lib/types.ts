import type { Component, Snippet } from 'svelte';

/**
 * Control types for the props panel
 */
export type ControlType =
	| 'text'
	| 'number'
	| 'boolean'
	| 'select'
	| 'radio'
	| 'color'
	| 'range';

/**
 * Control configuration for a single arg
 */
export interface ArgType {
	/** Control type or false to disable control (prop still shows in table) */
	control: ControlType | { type: ControlType; options?: string[]; min?: number; max?: number; step?: number } | false;
	/** Description of the prop */
	description?: string;
	/** Type information for the props table */
	type?: { name: string; summary?: string };
	/** Whether this prop is required */
	required?: boolean;
	/** Default value for display in props table */
	defaultValue?: unknown;
}

/**
 * Map of prop names to their ArgType configuration
 */
export type ArgTypes = Record<string, ArgType>;

/**
 * Control types for CSS custom properties
 */
export type CssControlType = 'color' | 'text' | 'length' | 'number' | 'select';

/**
 * Configuration for a CSS custom property
 */
export interface CssPropType {
	/** Description of the CSS prop */
	description?: string;
	/** Default value */
	default?: string;
	/** Control type or config. Use false to disable control. */
	control?: CssControlType | { type: CssControlType; options?: string[] } | false;
}

/**
 * Map of CSS prop names to their configuration
 */
export type CssProps = Record<string, CssPropType>;

/**
 * Exported component method
 */
export interface MethodType {
	name: string;
	params?: string;
	returnType?: string;
	description?: string;
}

/**
 * Metadata exported from a .docs.svelte or .docs.svx file
 */
export interface DocMeta {
	title?: string;
	/** Component description (extracted from JSDoc) */
	description?: string;
	/** Component to document (if this is a component doc) */
	component?: Component<any>;
	/** Initial values for props (only for props that exist in the component) */
	args?: Record<string, unknown>;
}

/**
 * Parsed metadata with auto-generated fields (internal use)
 */
export interface ParsedDocMeta extends DocMeta {
	/** Auto-generated from component props */
	args?: Record<string, unknown>;
	/** Auto-generated from component interface Props */
	argTypes?: Record<string, ArgType>;
	/** Auto-generated from @cssvar JSDoc tags */
	cssProps?: CssProps;
	/** Auto-generated from exported functions */
	methods?: MethodType[];
}

/**
 * A single example extracted from a doc file
 */
export interface Example {
	name: string;
	render: Snippet<[args: Record<string, unknown>]> | Snippet<[]>;
	/** Source code of the snippet (extracted by vite plugin) */
	source?: string;
}

/**
 * Parsed doc file with metadata and examples
 */
export interface DocFile {
	path: string;
	meta: ParsedDocMeta;
	examples: Example[];
	module: Record<string, unknown>;
	/** Type of doc: 'component' has a component in meta, 'page' is standalone documentation */
	type: 'component' | 'page';
	/** Whether this file is a markdown (.svx) file */
	isMarkdown?: boolean;
}

/**
 * Sidebar configuration options
 */
export interface SidebarOptions {
	/**
	 * Custom order for sidebar items. Use '*' for "everything else" (alphabetically).
	 *
	 * Can be an array for top-level ordering, or an object for nested folder ordering.
	 * Use path keys (e.g., 'Components/Forms') for deep nesting.
	 * @example
	 * // Top-level only
	 * order: ['Specs', 'Components', '*']
	 *
	 * // With nested folder ordering
	 * order: {
	 *   root: ['Specs', '*'],
	 *   Specs: ['Sidebar', 'Doc Files', '*'],
	 *   'Components/Forms': ['Input', 'Select', '*']
	 * }
	 */
	order?: string[] | Record<string, string[]>;

	/**
	 * Paths to expand by default in the sidebar.
	 * @example
	 * open: ['Layout', 'Layout/Frame', 'Components']
	 */
	open?: string[];
}

/**
 * Sdocs configuration options
 */
export interface SdocsOptions {
	/** Sidebar configuration */
	sidebar?: SidebarOptions;
}

/**
 * Props for the main Sdocs component
 */
export interface SdocsProps {
	/**
	 * Docs loaded via import.meta.glob.
	 * Optional - if not provided, uses docs from virtual:sdocs module.
	 * @example
	 * const docs = import.meta.glob('$lib/**\/*.docs.svelte', { eager: true });
	 */
	docs?: Record<string, unknown>;

	/**
	 * Configuration options for Sdocs.
	 * @example
	 * options: {
	 *   sidebar: {
	 *     order: { root: ['Layout', '*'] },
	 *     open: ['Layout']
	 *   }
	 * }
	 */
	options?: SdocsOptions;
}

