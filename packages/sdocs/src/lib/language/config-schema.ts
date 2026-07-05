/**
 * A structured description of the `sdocs.config.*` shape, mirroring the
 * `SdocsConfig` type. Editor tooling consumes this to offer key and value
 * completions in projects that don't install `sdocs` (where the TypeScript
 * type isn't resolvable). Keep it in step with `SdocsConfig` in `types.ts`.
 */

/** One config key: how to present, insert, and (for enums) value-complete it. */
export interface ConfigFieldSchema {
	/** Short type hint shown as the completion detail, e.g. `'string | string[]'`. */
	detail: string;
	/** Markdown documentation for the key. */
	doc: string;
	/** Snippet inserted after the key name — includes the `:` and a tabstop. */
	insert: string;
	/** Allowed values, for value-position completion. */
	values?: string[];
	/** Whether `values` are strings (quoted on insert) or literals (inserted bare). */
	quoted?: boolean;
	/** Nested object schema, when this key holds an object. */
	object?: ConfigSchema;
}

/** A config object shape: its keys mapped to their field descriptions. */
export type ConfigSchema = Record<string, ConfigFieldSchema>;

// Sizing knobs shared by the page/docs/layout content objects.
const maxWidth: ConfigFieldSchema = {
	detail: 'string',
	doc: 'Content column max width — any CSS length (`1200px`, `80ch`, `100%`).',
	insert: ": '$0'",
};
const padding: ConfigFieldSchema = {
	detail: 'string',
	doc: 'Space around the content — any CSS padding shorthand (`16px`, `1rem 2rem`).',
	insert: ": '$0'",
};

// Stage-layout knobs shared by the docs preview/example stages.
const direction: ConfigFieldSchema = {
	detail: "'row' | 'column'",
	doc: 'Preview/example stage `flex-direction`. Default: `row`.',
	insert: ": '${0:row}'",
	values: ['row', 'column', 'row-reverse', 'column-reverse'],
	quoted: true,
};
const gap: ConfigFieldSchema = {
	detail: 'string',
	doc: 'Gap between stage items — any CSS length. Default: `16px`.',
	insert: ": '$0'",
};
const contentX: ConfigFieldSchema = {
	detail: "'left' | 'center' | 'right' | 'justify'",
	doc: 'Horizontal alignment of stage contents. Default: `left`.',
	insert: ": '${0:left}'",
	values: ['left', 'center', 'right', 'justify'],
	quoted: true,
};
const contentY: ConfigFieldSchema = {
	detail: "'top' | 'middle' | 'bottom' | 'justify'",
	doc: 'Vertical alignment of stage contents. Default: `top`.',
	insert: ": '${0:top}'",
	values: ['top', 'middle', 'bottom', 'justify'],
	quoted: true,
};

/** The `sdocs.config.*` schema, rooted at the exported config object. */
export const configSchema: ConfigSchema = {
	include: {
		detail: 'string | string[]',
		doc: 'Glob pattern(s) locating your `.sdoc` files. Default: `./src/**/*.sdoc`.',
		insert: ": ['$0']",
	},
	port: {
		detail: 'number',
		doc: 'Dev server port. Default: `3000`.',
		insert: ': ${0:3000}',
	},
	open: {
		detail: 'boolean',
		doc: 'Open the browser when the dev server starts. Default: `false`.',
		insert: ': ${0:false}',
		values: ['true', 'false'],
	},
	css: {
		detail: 'string | Record<string, string>',
		doc: 'CSS loaded inside preview iframes — a single stylesheet path, or a map of named stylesheets to switch between.',
		insert: ": '$0'",
	},
	logo: {
		detail: 'string',
		doc: 'Sidebar logo text. Default: `sdocs`.',
		insert: ": '${0:sdocs}'",
	},
	icon: {
		detail: 'string | false',
		doc: "Sidebar logo icon: `'sdocs'` for the built-in mascot, an image URL, or `false` to hide it. Default: `'sdocs'`.",
		insert: ": '${0:sdocs}'",
		values: ['sdocs'],
		quoted: true,
	},
	sidebar: {
		detail: 'object',
		doc: 'Sidebar ordering and default-expanded folders.',
		insert: ': {\n\t$0\n}',
		object: {
			order: {
				detail: 'Record<string, string[]>',
				doc: "Per-folder sort overrides. Keys are folder paths (`'root'` for the top level); `'*'` stands for unlisted items.",
				insert: ': {\n\t$0\n}',
			},
			open: {
				detail: 'string[]',
				doc: 'Folders expanded by default on load.',
				insert: ': [$0]',
			},
		},
	},
	content: {
		detail: 'object',
		doc: 'Content presentation per entity kind. Entity and block attributes override these.',
		insert: ': {\n\t$0\n}',
		object: {
			page: {
				detail: 'object',
				doc: '`[PAGE]` content. Defaults: `maxWidth` `1200px`, `padding` `32px`, `toc` `true`.',
				insert: ': {\n\t$0\n}',
				object: {
					maxWidth,
					padding,
					toc: {
						detail: 'boolean',
						doc: 'Show the page table of contents. Default: `true`.',
						insert: ': ${0:true}',
						values: ['true', 'false'],
					},
				},
			},
			docs: {
				detail: 'object',
				doc: '`[DOCS]` pages. `maxWidth` is the content column; `padding`/`direction`/`gap`/`contentX`/`contentY` are the default preview & example stage layout.',
				insert: ': {\n\t$0\n}',
				object: { maxWidth, padding, direction, gap, contentX, contentY },
			},
			layout: {
				detail: 'object',
				doc: '`[LAYOUT]` stages. Defaults: `maxWidth` `100%`, `padding` `0px`.',
				insert: ': {\n\t$0\n}',
				object: { maxWidth, padding },
			},
		},
	},
};
