/**
 * Hover documentation for sdoc block tags. Block tag lines project to
 * {#snippet} wrappers, so the embedded Svelte server can't describe them —
 * these are the sdoc language's own docs, shown for the tag token on
 * opener and closer lines.
 */

import { MarkupKind, type Hover, type Position } from 'vscode-languageserver-protocol';

const SITE = 'https://gabilungu.github.io/sdocs';

const TAG_DOCS: Record<string, string> = {
	DOCS: [
		'**`[DOCS]`** — component documentation entity',
		'',
		'Holds live `[preview]` blocks (rendered component, prop controls, extracted API) and frozen `[example]` blocks.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated: `title="Form / Button"`. A leading `:` on the first segment renders it as a group header.',
		'- `description` — subtitle under the page heading.',
		'- `maxWidth` — content column width (default `1200px`).',
		'- `padding` / `direction` / `gap` / `align` / `alignY` — default stage layout for this entity\'s previews and examples.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	PAGE: [
		'**`[PAGE]`** — standalone page',
		'',
		'Markdown prose with Svelte islands: component tags, HTML sections, and `{#snippet}` blocks pass to Svelte untouched; `{expressions}` interpolate values from the file `<script>`.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated; a leading `:` groups.',
		'- `maxWidth` — content column width (default `1200px`).',
		'- `padding` — space around the page content (default `32px`).',
		'- `toc` — `toc="false"` hides the table of contents.',
		'',
		`[Page docs reference](${SITE}/language/page-docs)`,
	].join('\n'),
	LAYOUT: [
		'**`[LAYOUT]`** — full-page composition',
		'',
		'A Svelte body — components, expressions, template blocks — rendered on its own full-page stage.',
		'',
		'- `title` *(required)* — sidebar path, `/`-separated; a leading `:` groups.',
		'- `maxWidth` — stage width (default `100%`; narrower stages center).',
		'- `padding` — stage padding: `padding="48px"` (default `0px`).',
		'',
		`[Layout docs reference](${SITE}/language/layout-docs)`,
	].join('\n'),
	preview: [
		'**`[preview]`** — live component panel',
		'',
		'Renders the component with editable prop controls, its extracted API tables, and its source. Several previews in one `[DOCS]` render as tabs.',
		'',
		'- `component` *(required)* — an identifier imported in the file `<script>`: `component={Button}`.',
		'- `args` — initial props, as an object literal: `args={{ label: "Hi" }}`.',
		'- `title` — tab label when an entity has several previews.',
		'- `maxWidth` / `padding` / `direction` / `gap` — stage size & flow.',
		'- `align` — horizontal: `left`/`center`/`right`/`justify`. `alignY` — vertical: `top`/`middle`/`bottom`/`justify`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
	example: [
		'**`[example]`** — frozen example',
		'',
		'A Svelte snippet rendered live below the previews, without controls — for showing a composition or state the controls can\'t reach.',
		'',
		'- `title` *(required)* — the example heading (and its sidebar sub-entry).',
		'- `maxWidth` / `padding` / `direction` / `gap` — stage size & flow.',
		'- `align` — horizontal: `left`/`center`/`right`/`justify`. `alignY` — vertical: `top`/`middle`/`bottom`/`justify`.',
		'',
		`[Component docs reference](${SITE}/language/component-docs)`,
	].join('\n'),
};

/** Hover for the sdoc tag token at `position`, if the position is on one. */
export function sdocTagHover(source: string, position: Position): Hover | null {
	const line = source.split('\n')[position.line] ?? '';
	const re = /\[\/?(DOCS|PAGE|LAYOUT|preview|example)\b\]?/g;
	for (let m = re.exec(line); m; m = re.exec(line)) {
		const start = m.index;
		const end = m.index + m[0].length;
		if (position.character >= start && position.character <= end) {
			return {
				contents: { kind: MarkupKind.Markdown, value: TAG_DOCS[m[1]] },
				range: {
					start: { line: position.line, character: start },
					end: { line: position.line, character: end },
				},
			};
		}
	}
	return null;
}
