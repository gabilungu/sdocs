/**
 * Hover documentation for sdoc block tags. Block tag lines project to
 * {#snippet} wrappers, so the embedded Svelte server can't describe them —
 * these are the sdoc language's own docs, shown for the tag token on
 * opener and closer lines.
 */

import { MarkupKind, type Hover, type Position } from 'vscode-languageserver-protocol';

const SITE = 'https://gabilungu.github.io/sdocs';

const TAG_SHOWCASE: Record<string, string> = {
	SHOWCASE: [
		'**`[SHOWCASE]`** — component documentation entity',
		'',
		'Holds live `[component]` blocks (rendered component, prop controls, extracted API) and frozen `[example]` blocks.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated: `title="Form / Button"`. A leading `:` on the first segment groups; a leading `@slug/` places the entity in that config-declared section.',
		'- `description` — subtitle under the page heading.',
		'- `notes` — standing remarks, shown as alerts under the title and as a dot in the sidebar: `notes={[{ note: "Deprecated in v3", intent: "warning" }]}`. `intent` is `danger`/`warning`/`success`/`info`; unset is grey.',
		'- `slug` — overrides the URL segment; `hide` — routable but not listed in the sidebar.',
		'- `maxWidth` — content column width (default `1200px`).',
		'- `padding` / `direction` / `gap` / `contentX` / `contentY` — default stage layout for this entity\'s previews and examples.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	DOC: [
		'**`[DOC]`** — markdown documentation page',
		'',
		'Markdown prose rendered with the docs app\'s own styling, with Svelte islands: component tags, HTML sections, and `{#snippet}` blocks pass to Svelte untouched; `{expressions}` interpolate values from the file `<script>`. `[example]` blocks stage code in the project context — they are the only place the configured `css` loads.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated; a leading `:` groups, a leading `@slug/` picks the section.',
		'- `maxWidth` — width of the content column, toc included (default `1200px`).',
		'- `notes` — standing remarks, shown as alerts under the title and as a dot in the sidebar: `notes={[{ note: "Deprecated in v3", intent: "warning" }]}`. `intent` is `danger`/`warning`/`success`/`info`; unset is grey.',
		'- `padding` — space around the doc content (default `32px`).',
		'- `contentX` — aligns the content column: `left`/`center`/`right`.',
		'- `toc` — `toc="false"` hides the table of contents.',
		'- `slug` — overrides the URL segment; `hide` — routable but not listed in the sidebar.',
		'',
		`[Doc pages reference](${SITE}/language/doc-pages)`,
	].join('\n'),
	PAGE: [
		'**`[PAGE]`** — Svelte page in the docs app',
		'',
		'A plain Svelte body rendered as a real page — docs-context CSS, no stage tooling, no table of contents. Inside a max-width container like a `[DOC]`. With a `@section/` title it joins that section\'s sidebar; without one it routes at the site root (a landing page, `/pricing`, …) with no sidebar at all.',
		'',
		'- `title` *(required)* — sidebar path when sectioned; the route name when sectionless.',
		'- `notes` — standing remarks, shown as alerts under the title and as a dot in the sidebar: `notes={[{ note: "Deprecated in v3", intent: "warning" }]}`. `intent` is `danger`/`warning`/`success`/`info`; unset is grey.',
		'- `maxWidth` — width of the content container (default `1200px`; `100%` for full-bleed).',
		'- `padding` — space around the page content (default `32px`).',
		'- `contentX` — places the container: `left`/`center`/`right`.',
		'- `slug` — overrides the URL segment; `hide` — routable but not listed in the sidebar.',
		'',
		`[Svelte pages reference](${SITE}/language/svelte-pages)`,
	].join('\n'),
	LAYOUT: [
		'**`[LAYOUT]`** — full-page composition',
		'',
		'A Svelte body — components, expressions, template blocks — rendered on its own full-page stage.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated; a leading `:` groups, a leading `@slug/` picks the section.',
		'- `maxWidth` — stage width (default `100%`; narrower stages center).',
		'- `notes` — standing remarks, shown as alerts under the title and as a dot in the sidebar: `notes={[{ note: "Deprecated in v3", intent: "warning" }]}`. `intent` is `danger`/`warning`/`success`/`info`; unset is grey.',
		'- `padding` — stage padding: `padding="48px"` (default `0px`).',
		'- `slug` — overrides the URL segment; `hide` — routable but not listed in the sidebar.',
		'',
		`[Layout docs reference](${SITE}/language/layout-docs)`,
	].join('\n'),
	component: [
		'**`[component]`** — live component panel',
		'',
		'Renders the component with editable prop controls, its extracted API tables, and its source. Several component blocks in one `[SHOWCASE]` render as tabs.',
		'',
		'- `component` *(required)* — an identifier imported in the file `<script>`: `component={Button}`.',
		'- `args` — initial props, as an object literal: `args={{ label: "Hi" }}`.',
		'- `title` — tab label when an entity has several component blocks.',
		'- `synonyms` — other names this component answers to, comma-separated: `synonyms="pill, chip"`. Shown above the preview, and searched by the MCP `search_docs` tool.',
		'- `maxWidth` / `padding` / `direction` / `gap` — stage size & flow.',
		'- `contentX` — horizontal: `left`/`center`/`right`/`justify`. `contentY` — vertical: `top`/`middle`/`bottom`/`justify`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	example: [
		'**`[example]`** — frozen example',
		'',
		'A Svelte snippet rendered live on an isolated stage with the project\'s css, without controls. In `[SHOWCASE]` it renders below the previews; in `[DOC]` it renders in place, mid-prose — the way to showcase real components inside a documentation page.',
		'',
		'- `title` *(required)* — the example heading (and, in `[SHOWCASE]`, its sidebar sub-entry).',
		'- `code` — `code="false"` hides this example\'s code panel; shown by default.',
		'- `tags` — what this example shows, comma-separated: `tags="user menu, badge"`. Shown as quiet badges, and searched by the MCP `search_docs` tool.',
		'- `notes` — standing remarks, shown as alerts under the title and as a dot in the sidebar: `notes={[{ note: "Deprecated in v3", intent: "warning" }]}`. `intent` is `danger`/`warning`/`success`/`info`; unset is grey.',
		'- `maxWidth` / `padding` / `direction` / `gap` — stage size & flow.',
		'- `contentX` — horizontal: `left`/`center`/`right`/`justify`. `contentY` — vertical: `top`/`middle`/`bottom`/`justify`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
};

/** Hover for the sdoc tag token at `position`, if the position is on one. */
export function sdocTagHover(source: string, position: Position): Hover | null {
	const line = source.split('\n')[position.line] ?? '';
	const re = /\[\/?(SHOWCASE|DOC|PAGE|LAYOUT|component|example)\b\]?/g;
	for (let m = re.exec(line); m; m = re.exec(line)) {
		const start = m.index;
		const end = m.index + m[0].length;
		if (position.character >= start && position.character <= end) {
			return {
				contents: { kind: MarkupKind.Markdown, value: TAG_SHOWCASE[m[1]] },
				range: {
					start: { line: position.line, character: start },
					end: { line: position.line, character: end },
				},
			};
		}
	}
	return null;
}
