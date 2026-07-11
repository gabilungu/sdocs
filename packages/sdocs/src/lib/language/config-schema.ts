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

// Sizing knobs shared by the page/showcase/layout content objects.
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

// Stage-layout knobs shared by the showcase preview/example stages.
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
const background: ConfigFieldSchema = {
	detail: 'string',
	doc: "Preview/example stage background — a CSS color or a var() from the project's css (e.g. \`var(--bg)\`). Default: none.",
	insert: ": '\${0}'",
};
const minHeight: ConfigFieldSchema = {
	detail: 'string',
	doc: 'Minimum preview/example stage height — any CSS length. Reserves room for content that overflows the stage, like an open dropdown. Default: none.',
	insert: ": '$0'",
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
	static: {
		detail: 'string',
		doc: 'Folder of static assets served at the site root — images for pages, files for previews. Standalone CLI flows; embedded apps use the host\'s public directory.',
		insert: ": './${0:static}'",
	},
	title: {
		detail: 'string',
		doc: 'Header title text. Default: `sdocs`.',
		insert: ": '${0:sdocs}'",
	},
	logo: {
		detail: 'string | false',
		doc: "Header logo: `'sdocs'` for the built-in mascot, an image URL, or `false` to hide it. Default: `'sdocs'`.",
		insert: ": '${0:sdocs}'",
		values: ['sdocs'],
		quoted: true,
	},
	favicon: {
		detail: 'string',
		doc: "Browser-tab favicon — a path (e.g. `'/logo.svg'` from the static folder) or URL. Default: the built-in sdocs icon.",
		insert: ": '${0:/logo.svg}'",
	},
	sections: {
		detail: '{ slug, title?, order? }[]',
		doc: "The site's sections, in top-bar order. Titles reference a section by slug: `title=\"@guides/…\"`. `title` defaults to the capitalized slug; `order` lists route paths to pin first in the sidebar. Without sections, a single implicit `docs` section exists (no top bar).",
		insert: ": [\n\t{ slug: '$1' },$0\n]",
	},
	home: {
		detail: 'string',
		doc: "Route path of the landing page, e.g. `'guides/introduction'`. Must resolve to an entity; without it the root shows the About page.",
		insert: ": '$0'",
	},
	routing: {
		detail: "'history' | 'hash'",
		doc: "URL style: `'history'` for real paths (standalone CLI default), `'hash'` for `#/` URLs (embedded default).",
		insert: ": '${0:history}'",
		values: ['history', 'hash'],
		quoted: true,
	},
	base: {
		detail: 'string',
		doc: "Public base path the built site is served under, e.g. `'/repo/'` for a GitHub project Pages site. Applies to `sdocs build` only. Default: `'/'`.",
		insert: ": '${0:/}'",
	},

	content: {
		detail: 'object',
		doc: 'Content presentation per entity kind. Entity and block attributes override these.',
		insert: ': {\n\t$0\n}',
		object: {
			doc: {
				detail: 'object',
				doc: '`[DOC]` content. Defaults: `maxWidth` `1200px`, `padding` `32px`, `toc` `true`, `contentX` `left`.',
				insert: ': {\n\t$0\n}',
				object: {
					maxWidth,
					padding,
					toc: {
						detail: 'boolean',
						doc: 'Show the doc table of contents. Default: `true`.',
						insert: ': ${0:true}',
						values: ['true', 'false'],
					},
					contentX: {
						detail: "'left' | 'center' | 'right'",
						doc: 'Horizontal alignment of the doc content column (with its toc). Default: `left`.',
						insert: ": '${0:center}'",
						values: ['left', 'center', 'right'],
						quoted: true,
					},
				},
			},
			page: {
				detail: 'object',
				doc: '`[PAGE]` content: the Svelte body renders inside a container. Defaults: `maxWidth` `1200px`, `padding` `32px`, `contentX` `left`.',
				insert: ': {\n\t$0\n}',
				object: {
					maxWidth,
					padding,
					contentX: {
						detail: "'left' | 'center' | 'right'",
						doc: 'Horizontal placement of the page content container. Default: `left`.',
						insert: ": '${0:center}'",
						values: ['left', 'center', 'right'],
						quoted: true,
					},
				},
			},
			showcase: {
				detail: 'object',
				doc: '`[SHOWCASE]` pages. `maxWidth` is the content column; `padding`/`direction`/`gap`/`contentX`/`contentY` are the default preview & example stage layout.',
				insert: ': {\n\t$0\n}',
				object: { maxWidth, padding, direction, gap, contentX, contentY, background, minHeight },
			},
			layout: {
				detail: 'object',
				doc: '`[LAYOUT]` stages. Defaults: `maxWidth` `100%`, `padding` `0px`.',
				insert: ': {\n\t$0\n}',
				object: { maxWidth, padding, background, minHeight },
			},
		},
	},
};
