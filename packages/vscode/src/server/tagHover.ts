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
		'Holds live `[COMPONENT]` blocks (rendered component, prop controls, extracted API) and frozen `[EXAMPLE]` blocks, plus `[NOTES]`, `[TODO]` and `[PROSE]`.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated: `title="Form / Button"`. A leading `:` on the first segment groups; a leading `@slug/` places the entity in that config-declared section.',
		'- `description` — subtitle under the page heading.',
		'- `slug` — overrides the URL segment; `hide` — routable but not listed in the sidebar.',
		'- `maxWidth` — content column width (default `1200px`).',
		'- `padding` / `direction` / `gap` / `contentX` / `contentY` — default stage layout for this entity\'s previews and examples.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	DOC: [
		'**`[DOC]`** — markdown documentation page',
		'',
		'Markdown prose rendered with the docs app\'s own styling, with Svelte islands: component tags, HTML sections, and `{#snippet}` blocks pass to Svelte untouched; `{expressions}` interpolate values from the file `<script>`. `[EXAMPLE]` blocks stage code in the project context — they are the only place the configured `css` loads.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated; a leading `:` groups, a leading `@slug/` picks the section.',
		'- `maxWidth` — width of the content column, toc included (default `1200px`).',
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
		'- `padding` — stage padding: `padding="48px"` (default `0px`).',
		'- `slug` — overrides the URL segment; `hide` — routable but not listed in the sidebar.',
		'',
		`[Layout docs reference](${SITE}/language/layout-docs)`,
	].join('\n'),
	component: [
		'**`[component]`** — live component panel',
		'',
		'Renders the component with editable prop controls, its extracted API tables, and its source. Several component blocks render as tabs; two or more must sit inside one `[COMPONENTS]`.',
		'',
		'- `component` *(required)* — an identifier imported in the file `<script>`: `component={Button}`.',
		'- `args` — initial props, as an object literal: `args={{ label: "Hi" }}`.',
		'- `title` — tab label when an entity has several component blocks.',
		'- `synonyms` — other names this component answers to, comma-separated: `synonyms="pill, chip"`. Shown above the preview, and searched by the MCP `search_docs` tool.',
		'- `status` — where the component sits in its life: `draft` · `wip` · `review` · `experimental` · `ready` · `deprecated`. Shown as a glyph on its tab. Optional; no status reads as "nobody said".',
		'- `maxWidth` / `padding` / `direction` / `gap` — stage size & flow.',
		'- `contentX` — horizontal: `left`/`center`/`right`/`justify`. `contentY` — vertical: `top`/`middle`/`bottom`/`justify`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	COMPONENTS: [
		'**`[COMPONENTS]`** — one tab strip',
		'',
		'Groups the `[COMPONENT]` blocks that document one family. They share a stage, a code panel and an API table, so they are a **single item** in the page — which is what lets `[PROSE]` sit before or after them and mean something.',
		'',
		'A lone `[COMPONENT]` needs no container. Two or more do: with prose between them there is no correct place for the tab strip they share.',
		'',
		'Takes no attributes, and holds `[COMPONENT]` blocks only. One per `[SHOWCASE]`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	NOTES: [
		'**`[NOTES]`** — standing remarks',
		'',
		'One note per line, shown as alerts under the title and rolled up as a dot in the sidebar. Once per entity, and once per `[EXAMPLE]`.',
		'',
		'```sdoc',
		'[NOTES]',
		'\t- bug: Focus ring lands 1px off in Safari.',
		'\t- a11y: The icon-only variant has no accessible name.',
		'\t- warning: Being replaced by ActionButton.',
		'\t- Just a remark, with no type.',
		'[/NOTES]',
		'```',
		'',
		'The type is `bug`, `a11y`, `warning`, `perf`, `tip` or `info`; leave it off for a plain remark. The sidebar shows the worst note at or under a row, ranked `bug` → `a11y` → `warning` → `perf` → *no type* → `tip` → `info` — a remark outranks advice, and advice outranks a fact.',
		'',
		'A note is an **observation**. Where a component sits in its life is `status` on the `[COMPONENT]`.',
		'',
		`[Notes reference](${SITE}/language/overview#notes)`,
	].join('\n'),
	TODO: [
		'**`[TODO]`** — a checklist',
		'',
		'Nested to any depth by indentation, and rendered wherever its entity or example is. Once per entity, and once per `[EXAMPLE]`.',
		'',
		'```sdoc',
		'[TODO]',
		'\t- [x] Ship the component',
		'\t- [ ] Document the dark theme',
		'\t\t- [ ] Decide the token names',
		'[/TODO]',
		'```',
		'',
		'Under `sdocs dev` the boxes are live: ticking one writes straight back into this file. A built site shows them read-only — there is no source there to write to.',
		'',
		`[Todo reference](${SITE}/language/overview#todo)`,
	].join('\n'),
	PROSE: [
		'**`[PROSE]`** — markdown between the blocks',
		'',
		'The capabilities of a `[DOC]` body — markdown, code fences, tables, and Svelte islands — anywhere in a `[SHOWCASE]`, rendered in the order it was written. Inside an `[EXAMPLE]` it is markdown only, and follows the example to its own route.',
		'',
		'Unlike the other two, a `[SHOWCASE]` may hold as many as it likes: that is the point of it.',
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
		'- `maxWidth` / `padding` / `direction` / `gap` — stage size & flow.',
		'- `contentX` — horizontal: `left`/`center`/`right`/`justify`. `contentY` — vertical: `top`/`middle`/`bottom`/`justify`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
};

/** Hover for the sdoc tag token at `position`, if the position is on one. */
export function sdocTagHover(source: string, position: Position): Hover | null {
	const line = source.split('\n')[position.line] ?? '';
	// Sub-block tags come in either casing — uppercase from 0.0.139, lowercase
	// in every file written before it — so [COMPONENT] and [EXAMPLE] list both
	// spellings and both resolve to the same entry. Matching is case-sensitive
	// rather than /i: the text blocks are uppercase-only, so `[notes](…)` in
	// prose stays a markdown link instead of hovering as a block.
	const re =
		/\[\/?(SHOWCASE|DOC|PAGE|LAYOUT|COMPONENTS|COMPONENT|EXAMPLE|NOTES|TODO|PROSE|component|example)\b\]?/g;
	for (let m = re.exec(line); m; m = re.exec(line)) {
		const start = m.index;
		const end = m.index + m[0].length;
		const entry = TAG_SHOWCASE[m[1]] ?? TAG_SHOWCASE[m[1].toLowerCase()];
		if (entry && position.character >= start && position.character <= end) {
			return {
				contents: { kind: MarkupKind.Markdown, value: entry },
				range: {
					start: { line: position.line, character: start },
					end: { line: position.line, character: end },
				},
			};
		}
	}
	return null;
}
