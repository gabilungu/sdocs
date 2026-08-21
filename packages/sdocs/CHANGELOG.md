# Changelog

All notable changes to the `sdocs` package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Anything that changes what an existing `.sdoc` file or config means goes under
a **`### Breaking`** heading, first in its release. The MCP `get_changelog`
tool reads those first when an agent asks what changed between two versions, so
a breaking change written under any other heading is one an agent will miss.

## [Unreleased]

## [0.0.139] - 2026-08-21

### Breaking

- **`notes={[…]}` is replaced by a `[NOTES]` block**, and its `intent`
  vocabulary by a status one. A file using the attribute now reports an unknown
  attribute rather than rendering.

  ```sdoc
  [NOTES]
  	- bug: Focus ring lands 1px off in Safari.
  	- deprecated: Being replaced by ActionButton in v4.
  	- Just a remark, with no status.
  [/NOTES]
  ```

  `danger`/`warning`/`success`/`info` become `bug`/`deprecated`/`wip`/`ready`,
  ranked in that order with a status-less note between `wip` and `ready`. The
  vocabulary is what state a thing is in, not how loud the note is: `a11y` and
  `perf` are categories rather than states, and mixing the two makes the
  sidebar's worst-first roll-up meaningless — categories are what `tags`
  already does.

  The MCP filter follows: `search_docs({ type })` instead of `{ intent }`.

- **Two or more `[COMPONENT]` blocks in one `[SHOWCASE]` must sit inside a
  `[COMPONENTS]`.** A lone one still needs no container.

  Several component blocks are tabs over a shared stage, one code panel and one
  API table — a single item on the page rather than two things in a row. Now
  that a `[SHOWCASE]` can also hold prose, that has to be written down: with
  two bare components and a paragraph between them there is no correct place
  for the tab strip they share, and refusing beats guessing.

### Added

- **`[TODO]`** — a checklist, nested to any depth by indentation, once per
  entity and once per `[EXAMPLE]`. It always renders when present, and under
  `sdocs dev` the boxes are live: ticking one writes back into the `.sdoc`,
  changing the single character between the brackets and nothing else. A built
  site shows the same list read-only, since there is no source there to write
  to.

  Indentation is meaning here rather than layout, so the formatter leaves a
  `[TODO]` body exactly as written.

- **`[PROSE]`** — the capabilities of a `[DOC]` body (markdown, fences, tables,
  Svelte islands) anywhere in a `[SHOWCASE]`, as many times as you like.
  Blocks render in the order they were written, the tab strip included.

  Inside an `[EXAMPLE]` it is markdown only, and it follows the example to its
  own route where a sibling block would not. A `[DOC]` takes none: its body is
  already prose, and a nested block would have no answer to where it goes
  relative to the body around it.

- **An example opened on its own route shows everything it carries** —
  description, notes, todo, prose and tags — instead of just its title and its
  stage.

### Changed

- **The text blocks are matched uppercase and alone on their line.** They carry
  no attributes, so nothing else can follow the tag. This is not a style rule:
  `[notes](/language/overview)` at the start of a line is an ordinary markdown
  link, and a case-insensitive tag turned it into a block opener — it broke a
  page of our own docs.

- **The TextMate grammar accepts either casing** for `[COMPONENT]` and
  `[EXAMPLE]`, and highlights the new blocks. The formatter capitalizes tags,
  so a grammar that only knew lowercase would stop highlighting its own output.

## [0.0.138] - 2026-08-21

### Added

- **`code="false"` on `[example]`** hides its code panel — for a `[DOC]` where
  an example illustrates the prose rather than showing how it is built. Shown
  by default, and honoured everywhere an example's code appears: mid-prose in a
  `[DOC]`, in a `[SHOWCASE]`'s example list, and on the example's own route.

  A value that is neither `"true"` nor `"false"` is an error. `[DOC]`'s older
  `toc` reads anything that isn't `"true"` as false, which makes `toc="flase"`
  a silent instruction; a typo that quietly hid your code would look like a
  decision, so this one says so instead.

### Changed

- **`list_docs` says what it now returns.** It has been reporting each
  component's `synonyms`, each example's `tags`, and the `notes` on either
  since 0.0.136, but its tool description still advertised only entities,
  components and routes — so an agent reading the tool list had no reason to
  expect them.


## [0.0.137] - 2026-08-21

### Added

- **Stages resize vertically.** A drag bar under every `[component]` preview
  and every `[example]` sets the height of its iframe — for a dropdown that
  opens downward, a list meant to scroll, a component whose empty state is two
  lines and whose full state is forty. Drag it, or tab to it and use the arrow
  keys; the px readout beside the grip hands the stage back to sizing itself.

  A stage normally grows to whatever it reports, capped at 800px. A dragged
  height overrides both, and the frame starts scrolling — dragged shorter than
  its content, it would otherwise just lose the rest.

  The bar lives inside the resizable pane, so it spans exactly the stage and
  narrows with the horizontal handle rather than tracking a second copy of that
  width. Like the width handle it stays invisible until hovered, and like the
  width overrides the height is per visit, not remembered.

  Not on `[LAYOUT]`, which is the height of the viewport by definition, nor on
  `[PAGE]`, which is ordinary page flow.


## [0.0.136] - 2026-08-21

### Fixed

- **The package's own bundled docs parse again.** Fourteen `.sdoc` files inside
  the package kept the pre-0.0.67 `[preview]` tag, which the parser stopped
  accepting when `[component]` replaced it — and they ship in `dist`, so the
  package carried source its own parser rejected, and `sdocs dev` on the
  package opened with a wall of diagnostics. Renamed, along with the three in
  the test apps, and a test now reads every bundled document so they cannot
  drift again.

### Added

- **`synonyms` on `[component]`, `tags` on `[example]`.** A component is rarely
  known by one name, and an example rarely shows one thing. Both take a
  comma-separated list — spacing, a trailing comma and a repeat all wash out —
  and both render as quiet badges beside the block they belong to: the
  component's other names above its preview, an example's tags under its
  description. They are metadata, and they are styled to read as a footnote
  rather than a heading.

- **`search_docs`, a new MCP tool.** Finds documentation by any name it goes
  under: the entity title, a component it previews, that component's synonyms,
  an example title, an example's tags, or the text of any of its notes. An
  `intent` sweeps by note severity instead of by text — `intent: 'danger'`
  lists everything marked danger with no query at all, `'none'` finds the notes
  written without an intent, and giving both means a result has to satisfy
  both. Matching is a case-insensitive
  **substring** — `butt` finds `Button`, `menu` finds every example tagged
  "user menu" — because an agent looking for a component rarely knows what the
  project calls it, and a search that only answers to whole words sends it back
  to reading files. Every hit reports which name matched and the route it
  serves at, ready to hand to `resolve_visual_target`. Hits carry their notes,
  so finding a page is also reading what it warns about. `list_docs` reports
  the tags, synonyms and notes too.

- **`notes` on every entity and every `[example]`.** Standing remarks about a
  page — deprecated, unfinished, known-broken — written where the page is
  defined:

  ```sdoc
  [SHOWCASE
  	title="Forms / Button"
  	notes={[
  		{ note: 'Being replaced by ActionButton in v4.', intent: 'warning' },
  		{ note: 'Ships in the next release.' },
  	]}
  ]
  ```

  Each renders as an alert under the entity's title, in the order written. A
  `[LAYOUT]` has no title to sit under, so its notes ride over the layout, each
  with a dismiss button — the one place a note can cover what it is about, so
  the one place it can be put away. An example opened on its own route carries
  its notes with it.

  In the sidebar they become one dot on the row: filled when the worst of them
  is on that page, hollow when it belongs to something inside it. A row shows
  the worst note at or under it, ranked `danger` > `warning` > *no intent* >
  `success` > `info` — a note written without an intent says "read me" without
  saying what about, which is more than one whose whole content is
  reassurance. A `hide` entity stays out of the roll-up: the mark would point
  at a row the reader cannot open.

  `intent` is optional and unset is grey. Like `args`, the attribute is source
  text that is never evaluated: values must be plain quoted strings, and an
  unknown intent, an unknown key, or an entry with no `note` is a diagnostic
  rather than something quietly dropped.

- **Notes can be written from the Explorer, under `sdocs dev`.** A note button
  sits at the end of every entity and example title — and in the top-right
  corner, hidden until the pointer finds it, on a `[LAYOUT]` or `[PAGE]`, which
  show no title to hang it off. It opens an editor for that opener's notes: add
  one, reword one, change an intent, drop one. Save writes back into the
  `.sdoc` and Vite reloads the page.

  The edit is the smallest one that will do. Only the `notes` attribute's own
  span is rewritten, so the rest of the document keeps its formatting to the
  byte; emptying the list removes the attribute rather than leaving `notes={[]}`
  behind, restoring the file exactly as it was.

  It cannot leak into a build: the endpoint is mounted in `configureServer`,
  which only the dev server runs, and it refuses any file the project does not
  already document. An embedded Explorer opts in with `dev={import.meta.env.DEV}`.

- **The scale control gathers up, and resets on a click.** Its named presets
  move inside the slider's own control, to the right of the value, instead of
  standing beside it as a second control — one knob, one box. Clicking the
  control's label or its value resets the scale to the project's default;
  clicking the slider still sets a value, and double-clicking it still resets.
  Both are real buttons, so the reset is reachable by keyboard too.

  The label also drops away when the bar runs short of room, at the same width
  the axis switches give up their names for dropdowns — by then the row needs
  the space more than the reader needs the word, and the value stays either
  way.

- **A divider between top-bar sections.** A `{ type: 'divider' }` entry in the
  config's `sections` array draws a thin rule between the tabs on either side
  of it, for setting one group of sections apart from another.

  It is not a section: it resolves to a mark on the section before it, so
  routing, titles, the sidebar and the slug checks never learn it exists. One
  at either end of the array draws nothing, so reordering the sections can't
  leave a rule dangling off the end of the bar.


## [0.0.135] - 2026-08-20

### Fixed

- **The clipboard shortcuts work in an editor's docs tab.** An editor built on
  Electron answers `Cmd/Ctrl+C` from its application menu rather than leaving
  it to the browser: for a webview it becomes an `execCommand('copy')` against
  the webview's own document. The Explorer runs one level deeper, in a
  cross-origin frame that document cannot reach, so the command found no
  selection and copying, cutting, pasting and select-all all did nothing —
  the page looked like it forbade them.

  The key event does arrive in the frame — a key event doesn't cross origins,
  which is also why the editor never sees it — so the Explorer now answers
  those shortcuts itself, and only there: framed inside such a host, never in
  an ordinary browser, which already does all of this natively.

  A webview stays a sandboxed frame either way. `window.open`, `alert()` and
  `confirm()` are not the host's to grant, so an example that calls one still
  needs a real browser.


## [0.0.134] - 2026-08-20

### Fixed

- **A layout now reaches the right edge of the window.** The content column
  reserves the scrollbar gutter so its width doesn't change between a page
  that scrolls and one that doesn't — but a layout is exactly the height of
  the view and never scrolls, so the reservation was permanent dead space:
  ~15px of background past the layout, with the resize handle held that far
  off the edge and unable to drag the layout out to the full width. Layout
  routes drop the gutter.


## [0.0.133] - 2026-08-20

### Fixed

- **Sidebar rows no longer squash when the tree outgrows its pane.** A tree is
  a column flex container, and `height` on a flex item is a base size it is
  free to shrink below — so rows compressed from 28px to 16 the moment there
  was more tree than room, instead of the pane simply scrolling.

  Only the rows sitting directly in the tree were affected: one inside a branch
  wrapper was spared because the wrapper gave way on its behalf. `[DOC]`,
  `[PAGE]` and `[LAYOUT]` entities are leaves at the top level, while examples
  live nested under their component — which is why the squashing tracked the
  entity kind and looked like docs and layouts being sized differently.
  `NavTree` rows and branch wrappers now refuse to shrink.

- **The sidebar column holds its width against wide content.** It was an
  ordinary flex item, so a table, an unwrappable code line, or a layout stage
  with a min-width could take space from it. The nav keeps its 260px and the
  content column scrolls its own overflow instead.


## [0.0.132] - 2026-08-20

### Fixed

- **Sidebar rows without a chevron now reserve its space**, so every label
  column ends at the same x. A row with children spends its last 26px on the
  expander — the 20px button plus the row gap — and a row without one used the
  full width, so labels stopped at two different places and only the expandable
  rows truncated early. Since a component with examples gets a chevron while a
  `[LAYOUT]`, `[DOC]` or `[PAGE]` never does, the difference tracked the entity
  kind and read as layouts and docs being sized differently from components.
  The reserved width shares a variable with the chevron itself, so the two
  can't drift apart.


## [0.0.131] - 2026-08-19

### Fixed

- **The sidebar tree and the content column no longer resize when a scrollbar
  appears.** Both reserve the gutter now (`scrollbar-gutter: stable`), so the
  width is the same whether or not one is showing.

  The sidebar lost ~15px the moment the tree outgrew its pane — 260 down to
  245 — narrowing every row and pushing the longer labels into truncation, a
  reflow caused by expanding a folder rather than by anything about the item.
  The content column had the same jump between a long `[DOC]` that scrolls and
  a short component page that doesn't, so the text width changed as you moved
  between them.


## [0.0.130] - 2026-08-19

### Fixed

- **The Explorer lost its own fonts in 0.0.127.** The missing-asset guard added
  that release checked for a file only under the public directory, but Vite
  serves root-absolute paths from its root as well — which is where the staged
  Explorer keeps Figtree and JetBrains Mono. Every one of them 404'd and the
  whole UI fell back to a system face. The guard now treats a file found in
  either place as found, and an e2e test covers both halves at once: a missing
  asset must 404, and the Explorer's own font must still serve. A rule that
  answers "not found" has to know everywhere a file can legitimately be found.


## [0.0.129] - 2026-08-19

### Added

- **Named stops on the scale slider.** `presets` gives the common sizes
  buttons, in the same segmented control the axes use:

  ```js
  scale: {
    min: 0.75, max: 1.5, default: 1, step: 0.05,
    presets: [
      { label: 'S', value: 0.875 },
      { label: 'M', value: 1 },
      { label: 'L', value: 1.25 },
    ],
  }
  ```

  Picking one sets the slider; the slider still reaches everything between, and
  moving it off a stop leaves no preset showing as active. A preset outside
  `min`–`max` is refused with a warning rather than clamped — a button labelled
  `XL` that quietly lands somewhere other than its declared value is worse than
  one that isn't there. On a narrow viewport the stops move into the drawer
  with the rest of the controls.


## [0.0.128] - 2026-08-19

### Added

- **A scale slider.** Some dimensions of a design system aren't a set of names,
  and an axis can't express a range. Declare one in `sdocs.config.js`:

  ```js
  scale: { min: 0.75, max: 1.5, default: 1, step: 0.05 }
  ```

  and the top bar gets a slider beside the axis controls, at the same height.
  Its value lands on every preview, example and layout as a **CSS custom
  property** — `--scale` unless `var` names another — so the project's css
  multiplies by it: `padding: calc(8px * var(--scale, 1))`.

  A property rather than an attribute because that is the difference between a
  range and a set of names: `[data-density="compact"]` can carry a block of
  rules, while `data-scale="1.25"` would need one rule per step. One rule
  reading a number covers the whole range.

  It travels the way the axes do — applied at boot from the parent frame so a
  late-mounting stage never paints unscaled first, posted to frames already on
  screen, persisted across reloads, and readable on a stage page as
  `?scale=1.25` (with `?scale-var=--ui-scale` when the project renamed the
  property, since a stage opened alone has no parent to ask). Double-clicking
  the slider returns it to the default. A range that cannot produce a usable
  control — min at or above max, a step of zero, a `var` that isn't a custom
  property — is refused with a warning rather than a missing slider; a default
  outside the range is pulled into it.

  Embedded hosts read it from `virtual:sdocs` and pass `<Explorer {scale} />`.


## [0.0.127] - 2026-08-19

### Fixed

- **A props type named by an alias lost its values and its control.** A
  component whose interface said `variant?: ButtonVariant` documented the bare
  word `ButtonVariant` — no visible set of allowed values, and no select in the
  props panel, since the control is derived from the type text. Inlining the
  union restored both but duplicated a type the package wanted to export by
  name, so authors had to choose. Aliases naming a union of literals are now
  resolved during extraction; object and function aliases keep their name,
  which reads better and never produced a control anyway.

- **A missing static asset answered with the app shell.** Vite's history
  fallback rewrites any unmatched path to `index.html`, which is right for a
  route and wrong for a file: a font that wasn't there arrived as `200
  text/html`, so the browser reported a decode failure with no hint the path
  was simply wrong, and a status-code smoke test passed over a broken page.
  Bare paths with a static-asset extension now 404 when the file isn't on
  disk. Deliberately narrow — no query string, nothing under a Vite-owned
  prefix, code extensions excluded — so the module graph is untouched.

- **A configured port is now held rather than quietly swapped.** With `port`
  set and that port busy, the dev server moved to the next free one; when the
  thing holding it was a stale sdocs for the same project, every request and
  every MCP client kept reaching the old config, so edits looked ignored.
  An explicit port is an instruction and now fails loudly. An unset port keeps
  searching, as before.

- **A `css` value of the wrong shape is refused out loud.** `css: ['./a.css']`
  was accepted and then did nothing, leaving every stage unstyled with no
  explanation. Arrays, non-string paths, and other wrong shapes now warn and
  name the two forms that work.

- **The named-stylesheet pick survives a reload.** It was page state, so it
  reset to the first entry whenever the page fully loaded, while the axes
  beside it persisted — comparing two themes across several component pages
  meant re-picking constantly. Stored on the reader's choice rather than from
  an effect watching the value: an effect also fires for the startup default,
  which lands before the stored pick is read and would destroy it.

- **`sdocs init` scaffolded a config that did not match the schema.** The
  `sections` comment showed a string array (`['Guides', 'Components']`) where
  the type is `{ slug, title?, order? }[]`, and it offered a `sidebar` key that
  has never existed in `SdocsConfig`. Both replaced with the real shapes, plus
  `home`.

### Changed

- **The dev server says when the config file changes.** It is read once at
  startup, and every failure after an edit looks like something else. It now
  prints a line naming what happened; it does not restart, which would drop the
  page you were on and any live MCP session.

- **The guide covers `@import` of a static-served stylesheet.** Stage css is
  Vite-processed, so an `@import` resolves against the importing file: pulling
  in a stylesheet from the `static` folder must be root-absolute, the one place
  the base-relative rule for stage assets does not apply.


## [0.0.126] - 2026-08-19

### Changed

- **The authoring guide states that a stage needs no wrapper.** A preview or
  example stage is itself a flex container — `display: flex; flex-wrap: wrap`
  with direction, gap and alignment from its attributes — and the frame
  measures its content, grows to fit, and scrolls past 800px on its own. So a
  `<div style="display: flex; gap: 8px; height: 500px; overflow-y: auto">`
  duplicates two things that already exist. The guide had a one-line note
  covering the layout half; it now spells out the height and scrolling half
  too, with the anti-pattern written out beside the correct form, and names
  `minHeight` as the one height knob worth reaching for — it *reserves* room so
  an open dropdown or popover shows rather than being clipped, the opposite of
  a scroll box. Reaches agents through `get_authoring_guide` and the
  `sdocs://authoring-guide` resource; the same rule is now in the `[example]`
  language docs.


## [0.0.125] - 2026-08-19

### Fixed

- **"Open this stage in a new tab" did nothing in the editor's docs tab.** The
  Explorer runs two frames deep there, inside a webview whose sandbox does not
  grant `allow-popups`, so `target="_blank"` was silently swallowed — and VS
  Code only rewrites links in its own webview document, never inside a
  cross-origin child. The link now falls back to asking whoever frames it:
  `window.open` first (a plain browser answers it directly, and modifier and
  middle clicks are left to the browser as before), and only when the frame
  refuses does it post `sdocs:open-external` to its parent for the host to act
  on. Unframed use is unchanged.


## [0.0.124] - 2026-08-19

### Changed

- **Preview and example stages have 16px of padding by default**, up from
  none — a component pressed against the edge of its stage was never what the
  default should give you. `content.showcase.padding` overrides it as before,
  as do `padding` on the entity or the block. `[LAYOUT]` stages are unchanged:
  a full-page canvas wants its own edges.

- **The stylesheet picker renders like the axes.** It is the same kind of
  switch — named variants, one active — and it competes for the same bar
  width, so it is now one of the controls rather than a private dropdown:
  segmented while there is room, collapsing to dropdowns with the rest before
  the section tabs get crowded.

- **Every control and button in the top bar is the same height.** The row was
  ragged: the segmented tracks stood taller than the buttons because a flex
  item's automatic minimum silently beat their declared height, and the About
  link stood two pixels taller again because an `<a>` is content-box where a
  `<button>` is not.

### Added

- **A stage can be opened in its own tab** from a button beside the stage id,
  in the corner of every preview and example. A real link rather than a
  scripted `window.open`, so middle-click and "open in new window" behave the
  way the browser promises.


## [0.0.123] - 2026-08-15

### Fixed

- **A props type named anything but `Props` was ignored.** Extraction looked for
  that exact interface name, so `let { label }: ButtonProps = $props()` fell
  back to reading names out of the destructuring alone — every prop published
  with no type, no description, and marked **required**, since optionality
  lives on the interface. The props type is now read from whatever the
  `$props()` declaration is annotated with, and the same applies to the
  heritage that labels a `...rest` spread.

- **Extraction that could not see everything now says so.** A `$props()` bound
  to a name rather than destructured is valid Svelte that static analysis
  cannot follow, and it produced a props table indistinguishable from a
  component that genuinely has none. `get_component_api` and
  `scaffold_component_doc` now return a `warnings` array — either that defaults
  were unreadable (the interface still supplies types and optionality), or that
  nothing could be extracted at all. Silence continues to mean the extraction
  is complete.

- **Every malformed block opener is reported in one pass.** The scanner
  abandoned the file at the first stray character, so the same typo on three
  openers cost three fix-and-revalidate rounds. It now resumes at the end of
  the opener, keeping the attributes it already read and the block's body and
  closer intact — a recovered document parses to the same entities as a correct
  one. The diagnostic for `>` also names the correction: openers close with `]`.

### Added

- **`validate_sdoc` reports each entity's resolved `route`.** Slug rules have a
  trap that only surfaces after publishing — segments are lowercased whole, so
  `IconButton` serves at `/iconbutton`, not `/icon-button`. The route is now
  visible where an author is already looking, before the title is committed to.

## [0.0.122] - 2026-08-15

### Fixed

- **`npx sdocs run` died on a missing vite in any project that has vite.** The
  commands imported vite statically, so Node resolved it from sdocs' own
  location — under npx, the cache directory beneath `~/.npm/_npx`, whose upward
  walk never reaches the project. That was survivable while npm installed the
  peers there, but npm skips installing a peer into the npx cache when it
  decides the surrounding project already satisfies it. In a project with vite
  the cache therefore holds sdocs and its dependencies and no vite at all, and
  `dev`, `build` and `preview` exited with `ERR_MODULE_NOT_FOUND` before doing
  anything — failing precisely in the projects most likely to run them, and
  working in bare ones.

  Vite now resolves from the project first, the way svelte and
  vite-plugin-svelte already did, falling back to sdocs' own copy for a
  genuinely bare project. The copy npm counted on is the copy that loads.

## [0.0.121] - 2026-08-15

### Added

- **Customization axes.** A design system varies along more than one dimension
  at once — light and dark, compact and airy, one palette or another — and
  named stylesheets could only ever swap one whole file. Declare each dimension
  in `sdocs.config.js` and the top bar offers it:

  ```js
  axes: [
    { id: 'scheme',  label: 'Theme',   values: ['light', 'dark'] },
    { id: 'density', label: 'Density', values: ['airy', 'compact'] },
  ]
  ```

  The reader's pick lands on every preview, example and layout as
  `data-<id>="<value>"` on the stage document's root; the project's own css
  supplies the meaning. sdocs never interprets an axis, so a project can
  declare any dimensions it likes without the tool knowing the vocabulary.

  Each axis renders as a compact segmented control while the bar has room, and
  they all collapse to dropdowns together before they'd crowd out the section
  tabs; on a narrow viewport they move into the navigation drawer. Picks
  persist across sessions and are validated against the config on load, so
  renaming a value doesn't leave returning readers with an attribute no
  stylesheet matches. A stage page also accepts them as URL parameters
  (`?axis-density=compact`), which addresses one component in one exact
  combination without an Explorer to click through.

  Embedded hosts read the configured axes from `virtual:sdocs` and pass them
  to `<Explorer {axes} />`.

## [0.0.120] - 2026-08-04

### Fixed

- **Touch-sized form controls no longer overshoot on a phone.** The text fields
  are `content-box`, so the 40px minimum height added in 0.0.117 sat *outside*
  their padding and border and measured 50px — taller than the select beside
  them, which is `border-box` and obeyed the rule exactly. Fields are now sized
  border-box, and the whole touch pass is dialled back to 36px: text inputs,
  selects, and the collapsible code panels all match, with the unset button at
  32px and the colour swatch trimmed to fit beside them. Text stays 16px, which
  is what stops Safari zooming the page when a field takes focus.

## [0.0.119] - 2026-08-04

### Fixed

- **Every preview stage on a built site 404'd.** `sdocs build` runs two Vite
  passes — the client build that emits `dist/previews/<token>/…`, and the SSR
  pass whose renderer produces the prerendered route pages. Only the client
  pass was told the project root, so the prerenderer encoded doc paths against
  the staging directory instead: pages shipped pointing at
  `../../../src/Thing.sdoc#thing` while the files on disk were
  `src/Thing.sdoc#thing`. Nothing failed during the build — the mismatch only
  showed up in a browser, where every `[component]`, `[example]` and `[LAYOUT]`
  iframe loaded the host's 404 page instead of the component. Dev servers were
  never affected, so a site looked right locally and shipped broken.

  The e2e build test checked that the emitted tokens were well-formed and that
  routes prerendered, but never that the two agreed; it now resolves every
  `previews/<token>` referenced by a built page against what was actually
  emitted.

## [0.0.118] - 2026-08-04

### Fixed

- **A dependency that ships `.svelte` source no longer breaks the dev server.**
  Vite prebundles bare imports with esbuild, which has no `.svelte` loader, so a
  package re-exporting straight into source — `@lucide/svelte`'s
  `export { default } from "./arrow-right.svelte"` — killed the optimize step.
  The import then 504'd and the component rendered without its icons, with
  nothing but an esbuild line in the server log to explain it. Such packages
  announce themselves with a `svelte` export condition (or the legacy top-level
  `svelte` field); those are now collected from the project's dependencies and
  handed to `optimizeDeps.exclude`, so the svelte plugin gets them intact.

  vite-plugin-svelte normally derives that list during its dependency scan,
  which sdocs disables because Rolldown-based Vite can't crawl `.svelte` entry
  graphs — so skipping the scan had quietly skipped the exclusion too. The
  manifest lookup does not go through the export map, since a package can
  decline to export `./package.json` and `.` alike.

## [0.0.117] - 2026-08-04

### Added

- **The Explorer works on a phone.** Below 860px it reshapes itself; nothing
  is configured and nothing is opted into.

  Navigation folds into one off-canvas drawer behind a burger: the top bar's
  section tabs as chips, the sidebar tree below them. The drawer closes where
  the user arrives — a tree leaf, a top-bar link — while a section chip only
  swaps which tree it shows and leaves it open to keep browsing, as does
  expanding a folder. `Escape` and a tap outside close it as well; the content
  behind it is inert while it is open, and focus moves into it and back to the
  burger afterwards. A sectionless `[PAGE]` keeps the burger too — a landing
  page has no tree of its own, but the section chips it replaces still need
  somewhere to live. The stylesheet picker moves to the foot of the drawer.

  Resizable stages give up their handles — there is no room to drag into and
  no pointer to grab with — and the preview takes the full width. A `[LAYOUT]`
  ignores its stored width there rather than showing a sliver of the layout
  with no handle to widen it again; the value is kept and returns with the
  window. Fullscreen is hidden, its only exit being a hover-only hot corner.

  API tables stop being a 520px grid and become one card per row, each cell
  labelled now that the headers are gone; rows with no default drop the
  labelled em-dash. Controls take the full width at 40px tall, with 16px
  fields so Safari does not zoom the page when focusing one.

  A page's authored `padding` has its horizontal values *capped* at 16px
  rather than replaced, so a page that asked for less keeps less. The "On this
  page" outline folds into a disclosure above the prose instead of pushing it
  down. The app measures itself in `dvh`, so a mobile browser's sliding
  toolbars no longer cut off the last rows.

### Changed

- `NavTree.Item` takes an `--item-h` custom property for its row height
  (default `28px`, as before) — a touch context can ask for a bigger target
  than a pointer needs.
- The `Control` components (text, number, dimension, select, checkbox, colour)
  size up for touch below 860px.

## [0.0.116] - 2026-07-28

### Fixed

- **Route slugs fold accents instead of deleting them.** `\w` is ASCII-only, so
  filtering ran before any folding and ate the letter: `Verificări` became
  `/verificri`, `Setări` became `/setri`, `Zażółć` became `/zac`. Titles now
  normalize (NFD) and drop combining marks first, with an explicit map for
  letters whose diacritic is part of the glyph and therefore has no
  decomposition (ł, đ, ø, ß, æ, œ, þ, ð, ı). Heading anchors fold the same way,
  as their comment always claimed. Scripts with no ASCII base (Greek, Cyrillic,
  CJK) still fall back to `item` and want an explicit `slug=`.

  **This changes existing routes** for any title with an accented letter. Pin
  `slug="…"` on an entity whose URL must not move.

- **Staging directories no longer accumulate.** A killed dev server never reaches
  cleanup, so `node_modules/.cache/sdocs-*` grew by one directory (~870 KB) per
  run — four had piled up in one project. Each staging directory now records its
  owner's pid, and a new run sweeps the ones whose owner is gone. Liveness is
  decided by pid, never by age: two sdocs servers on two ports are a normal thing
  to run, and an age rule would delete the other one's directory mid-run.

- **Linking a dependency into the staging tree no longer assumes it exports
  `./package.json`.** esm-env does not, and the resulting
  ERR_PACKAGE_PATH_NOT_EXPORTED escaped far enough to stop the server booting.
  The package root is now found from the entry point when the direct route
  fails, and a dependency that cannot be linked is skipped rather than fatal.

- **The packaged library no longer reaches for Vite's env object**, so
  `svelte-package` stops warning that it is unportable. `DEV` comes from esm-env
  (already every Svelte project's transitive dependency), linked into the staging
  tree like shiki.

### Documentation

- `llms.txt` now says to install `@sveltejs/vite-plugin-svelte` in the project
  even under `npx` — that is what keeps the compiler and the runtime one copy —
  and documents how route segments are slugified, including the escape hatch.

## [0.0.115] - 2026-07-28

### Fixed

- **`sdocs check` compiles again.** 0.0.114 resolved `svelte/compiler` from the
  project and imported the resolved FILE PATH — which skips the package's
  export conditions, so the CJS entry arrived as `{ default: exports }` with no
  named exports and every stage failed with `compile is not a function`. Both
  loaders now take whichever shape actually carries the API. `dev` and `build`
  were unaffected (vite-plugin-svelte is ESM), so the 0.0.114 toolchain fix
  stands. The test calls the loaded compiler instead of type-checking it.

## [0.0.114] - 2026-07-28

### Fixed

- **One svelte toolchain — the project's — for compiling AND running.**
  Component pages went blank in any project whose svelte was newer than the
  copy npx installs beside sdocs. `resolve.dedupe` already pinned the BROWSER
  to the project's svelte, but sdocs imported `@sveltejs/vite-plugin-svelte`
  from its own install, so its bundled compiler produced the code that
  runtime then had to render. Svelte 5.56 changed `rest_props`' `exclude`
  argument from an Array to a Set, so components compiled by 5.55 threw
  `target.exclude.has is not a function` inside `TwoPaneSplit` the moment a
  5.56 runtime rendered them. That killed `ComponentView`, which reads from
  the outside as "the sidebar does nothing": routes change, nothing renders,
  and no configuration explains it.

  The peers are declared `"*"` precisely so the host project's copies win,
  but npx installs peers beside the tool — so the intent is now enforced at
  load time. `@sveltejs/vite-plugin-svelte` (which binds `svelte/compiler`
  from beside itself, so the compiler follows) and `svelte/compiler` are
  resolved from the project when it has them, with sdocs' own copies as the
  fallback for standalone use. `dev`, `build`, the prerenderer and `check`
  all go through it.

  When only half can be aligned — a project with svelte but no
  vite-plugin-svelte — sdocs now names both versions and the one-line fix
  instead of failing obscurely later.

## [0.0.113] - 2026-07-25

### Fixed

- **A stage now has one address, whoever is asked for it.** Doc paths were
  encoded against the Vite root, which for `sdocs dev` and `sdocs build` is a
  staging directory under `node_modules` — not the project. A standalone
  `sdocs mcp` server, having no dev server to ask, encoded against the project
  instead, so the two handed out different routes for the same stage. The
  route from stdio served its preview shell but the stage module behind it
  fell through, leaving a page that loaded and rendered nothing
  (`data-sdocs-stage-error="script"`), its `builtPreviewPath` pointed at a
  directory the build never emitted, and the same stage reported two different
  stage ids depending on which URL opened it. Dev, build, and both MCP
  transports now encode against the project, and a stage's id and module are
  derived from the entry that was found rather than from the token that asked
  for it. A token encoded against another root is still matched by path
  suffix, and that fallback now applies to the stage and mount modules too —
  serving the shell and then missing the module was worse than an honest miss.

  This changes the preview paths a build emits (`dist/previews/<token>/…`).
  Nothing links to them externally — the app loads them itself.

- **`resolve_visual_target` really accepts routes now.** It claimed to, but
  routes were only flattened into words and fuzzy-matched against stage names,
  so `/atoms/button/sizes` appeared to work — its segments happen to spell the
  stage — while the entity route `/atoms/button` matched nothing. Routes are
  matched against the router's own table, the same one `list_docs` publishes:
  an entity route resolves to that entity's own stage (a SHOWCASE's
  `[component]`, a LAYOUT's body), a stage route to that stage, and a route
  that addresses nothing resolves to nothing instead of finding a lookalike.
- **A LAYOUT stage reports its source.** Its `source.line` and
  `source.component` were always null, because the lookup was built only from
  previews and examples and a layout body is neither. The `[LAYOUT]` line is
  now always reported, and when the body is built around a single component
  that component's `.svelte` is reported too — a body wrapping several names
  none of them rather than guess.
- A DOC or PAGE route now answers with why it has no stage — its prose renders
  natively inside the Explorer — plus the routes of its examples, instead of a
  bare "nothing matched" that reads like a bug.

## [0.0.112] - 2026-07-25

### Added

- **Stages are addressable, so an agent can look at one component instead of
  the whole app.** A preview page was always directly navigable; now it says
  what it is and when it's ready, and the MCP server can hand a client the
  route. Photographing the Explorer to inspect one button costs roughly a
  thousand times the image tokens of photographing the button (measured:
  ~1970 vs ~2 on a 42x36px component), which is real money on the agent's side.
  - **`resolve_visual_target`** (MCP): resolve `"Button / Sizes"`, a route, or
    a stage id to a preview-only route, the selectors to wait on, the `.svelte`
    file **and** `.sdoc` line behind it, its declared `args`, and its resolved
    stage layout — so what you look at leads straight to what you edit, with no
    slug rules to reproduce. Ambiguous names are reported, never guessed.
  - **A ready marker**: `<html data-sdocs-stage-ready>`, set after mount,
    webfonts, and image decode. A stage that fails is marked ready too, with
    `data-sdocs-stage-error="render | script | timeout"` — a client waiting on
    the marker gets an answer instead of a timeout.
  - **`window.__sdocs.captureRect(selector?, { padding })`**: a clip rect grown
    to include what an element actually paints. Cropping to `boundingBox()`
    clips shadows, glows, and focus rings — usually the very thing under
    review — so the rect is grown by ink read from computed styles, and reports
    `bleeds` and `clipped` rather than silently cutting the halo.
    `inkBleed(selector?)` returns the per-side overflow alone.
  - **Stage ids**: a short stable handle per stage, shown on hover in the dev
    Explorer and copyable — the thing you say out loud ("look at sdocs:k3f9a")
    and hand to an agent. Dev only; a built site never shows one.
  - **`sdocs://visual-testing-guide`** and expanded `initialize.instructions`:
    read the DOM before taking any picture, then the element, then the stage,
    and the Explorer only when the Explorer is the bug.
  - **`?theme=`/`?css=`** on a stage URL: set `data-sdocs-theme`, or pick a
    configured stylesheet, on a direct visit. Media-query themes stay the
    browser's to emulate — sdocs doesn't fake `prefers-color-scheme`.
- Preview iframes carry a distinct accessible title (`Button — Sizes preview`)
  and `data-sdocs-stage-id`/`data-sdocs-stage-kind`, instead of every frame in
  a showcase being labelled `Component preview`.

  sdocs still takes no screenshots and depends on no browser: it exposes the
  route, the selectors, and the metadata; a separate browser tool does the
  looking.

### Fixed

- The dev server and the build shared one preview-page generator instead of two
  copies that had to be kept in step by hand.
- A preview URL carrying a query string (`?theme=dark`) is served rather than
  falling through to a 404.

## [0.0.111] - 2026-07-25

### Changed

- **`sdocs build` now fails on a `component={…}` reference that resolves to no
  component file**, with the same message and the same file/line `sdocs check`
  prints. Until now the build only warned and exited 0, so a preview whose API
  tables and controls had silently vanished could still deploy — `check` and
  `build` disagreed about the same document. The dev server still only warns:
  a typo shouldn't take the server down while you fix it.

### Fixed

- **A compound root with a TypeScript type annotation resolves.**
  `const ListBox: typeof Root & { Option: typeof Option } = Object.assign(Root,
  { Option })` resolved its members but not its root — the annotation sits
  between the binding and the `=`, where the resolver wasn't looking. Module
  resolution now reads the real TypeScript AST instead of matching source text,
  so annotations, line breaks, and formatting no longer change the outcome, and
  code inside comments and strings is no longer mistaken for a binding.
- A `component={…}` whose import resolves to a path with no file on disk is now
  reported like an unresolved reference instead of a bare parse warning.

## [0.0.110] - 2026-07-25

### Added

- An **About** button in the top bar, after the fullscreen control — a real
  link to the About page, so middle-click and open-in-new-tab work.

## [0.0.109] - 2026-07-25

### Fixed

- **A preview no longer renders blank when its component reads a required prop
  immediately.** The generated stage started with `args = {}` and received the
  declared `args={{ … }}` only afterwards, so a component dereferencing a
  required prop threw before the first update. The declared args now seed the
  stage's initial state (they're plain literals by design, so they serialize
  exactly), and a stage that throws anyway shows the error in place instead of
  leaving an unexplained blank frame.
- **`--help` and `--version` never run a command.** `sdocs build --help`
  started a full production build and wrote `dist/` — which could overwrite
  another tool's package output. Both flags are now recognised anywhere in the
  arguments and handled before dispatch.
- **Compound roots resolve from more index shapes.** `export default
  Object.assign(Base, { … })` written inline resolved its members but not its
  root (the identifier after `export default` is `Object`). Barrel files
  (`export { default as X } from './X.svelte'`) and named or aliased imports
  (`import { X }`, `import { Y as X }`) now resolve too. A default import from
  a module with no default export still correctly resolves to nothing.
- **Generated prose no longer reports `a11y_no_noninteractive_tabindex`.**
  shiki emits `<pre tabindex="0">` for scrollable code blocks — correct, and
  not the author's markup — so the warning is filtered for generated page
  modules during dev, build, and `sdocs check`. Stages and the project's own
  components keep the warning.

### Added

- `sdocs check` reports a `component={…}` that resolves to no component file
  as an error. The preview still renders, but its API tables and controls
  silently don't — the build only warns, so this is the gate for it.

## [0.0.108] - 2026-07-25

### Added

- **`sdocs coverage`** and the MCP **`check_coverage`** tool: which components
  have a `[component]` preview and which don't. References resolve through the
  Explorer's own resolver, so a compound family is measured **per
  sub-component** (`component={NavTree}` and `component={NavTree.Item}` land
  on different files). Also reports components documented from more than one
  `.sdoc` file, `[component]` references with no component source behind them,
  and documented components outside the globs. Several previews of one
  component *within* one file is a supported pattern and is never flagged as a
  duplicate. It's a report, not a gate — the command always exits 0.
- **`components`** config option: the glob(s) coverage measures against.
  Defaults to the `include` globs with `.sdoc` swapped for `.svelte`, which is
  right whenever docs sit beside their components; set it when they don't, or
  to narrow coverage to the public API.

## [0.0.107] - 2026-07-25

### Added

- **`sdocs check`** and the MCP **`check_docs`** tool: compile every
  documentation stage — each `[component]` preview, each `[example]`, and
  every `[DOC]`/`[PAGE]`/`[LAYOUT]` body — the way the dev server does, and
  report what breaks. This catches the class of problem the grammar check
  can't see, which until now surfaced only when the route was opened:
  - Svelte compile errors inside a stage,
  - relative imports that resolve to no file on disk (read with the same
    scanner the import rewriter uses, so an import-shaped line inside a code
    sample is never mistaken for one, and a Vite query like `?raw` resolves),
  - grammar diagnostics from the parser.

  Each problem names the file (with a `.sdoc` line where it maps back
  cleanly), the entity, and the stage. The CLI exits **1** on any error, so CI
  can gate on it; `check_docs` takes an optional `file` to check one document.
  Neither type-checks, and neither can see runtime-only failures.

## [0.0.106] - 2026-07-25

### Added

- `list_docs` returns the **route** each entity serves at, plus one per
  example. The routes come from the Explorer's own router — folders, sections,
  and `slug=` overrides included — so automation can open every page without
  reimplementing the slug rules.

### Fixed

- A native attribute inherited through the Props heritage
  (`interface Props extends HTMLAttributes<…>`) is no longer reported as
  **required** when it's destructured explicitly instead of left in `...rest`.
  Requiredness now comes from the declaration; only an untyped component still
  falls back to "no default means required".
- A file-level `<style>` no longer produces false unused-selector warnings in
  the dev-server output. The same block is injected into every stage *and*
  into the generated DOC/PAGE component, where stage-targeting selectors match
  nothing — that one diagnostic is now filtered for `/@sdocs/` modules only,
  so the project's own components keep every warning they'd normally get.

### Changed

- The slug algorithm is documented explicitly, including that **CamelCase is
  not split** (`IconButton` → `iconbutton`, not `icon-button`) and that
  `slug="…"` on the entity opener overrides the segment.

## [0.0.105] - 2026-07-24

### Changed

- Sidebar polish: the chevron is an independent rounded-square toggle inside
  the item (click it to expand/collapse without navigating; white on hover);
  clicking the item you're already on toggles it; items without children have
  no chevron; a divider sits under the search box; root items get the same
  1px gap as nested ones; and no more horizontal scrollbar when the vertical
  one appears.

### Fixed

- A `Snippet` whose parameter type contains an arrow (e.g.
  `Snippet<[{ close: () => void }]>`) is coloured as a snippet, not a function.

## [0.0.104] - 2026-07-24

### Fixed

- The resize canvas beside the stages draws its diagonal hatch from a tiled
  image instead of hairline CSS gradients, which shimmered at fractional
  device-pixel ratios.

### Changed

- `[LAYOUT]` pages share one remembered width: resizing any layout applies to
  every layout page and survives reloads — dial in a viewport once and click
  through a multi-screen flow at that size. Clicking the width readout resets
  it to full width. Component previews and examples keep their own per-page
  widths.
- The drag grip sits lighter and turns white on hover, over the grey bar that
  fades in.

### Added

- Links between pages work from inside a stage: an `<a>` in a layout, preview,
  or example that points at another sdocs route navigates the app instead of
  reloading the Explorer inside the iframe — multi-screen `[LAYOUT]` sketches
  can wire their flows together. External links, `target="_blank"`, downloads,
  and same-page `#anchors` keep their native behaviour.

## [0.0.103] - 2026-07-23

### Changed

- Sidebar: the redundant **Docs** child under each component is gone —
  selecting the component itself shows its docs (clicking also toggles its
  examples). A doc with several `[component]` previews now carries the
  compound multi-part icon, like nested component families always did.
- Sidebar: `:` groups are always expanded — the header is a plain label, no
  longer a collapse toggle.

## [0.0.102] - 2026-07-23

### Added

- Every stage is resizable: the component preview, each `[example]`, the
  full-page example view, and `[LAYOUT]` pages ride in a two-pane split — drag
  the handle (or focus it and use the arrow keys, Home / End) to narrow or
  widen the iframe down to 1px and test responsive behaviour, with a live
  pixel readout that matches the viewport exactly — click it to reset the
  width (it stays reachable at the view edge when the window shrinks below
  the stored width). Previews and examples start at the content column width;
  layouts start fully expanded, the handle hugging the right edge. The code panels (Preview Code, Component Source,
  each example's Code) sit below on their own, at the normal column width.

### Changed

- The preview stage is a bare viewport: no border, no corner radius — the
  resize canvas and handle delineate it, and the iframe gets the pane's exact
  width.
- **The default stage padding is now `0px`** (was `16px`): previews and
  examples render edge-to-edge by default. Restore the old spacing with
  `content: { showcase: { padding: '16px' } }` in `sdocs.config.js`, or
  per entity/block with the `padding` attribute.
- Page descriptions (the text under a SHOWCASE or DOC title) get a roomier
  line height, matching the preview description.

## [0.0.101] - 2026-07-23

### Changed

- A `[component]` description now renders as prose between the preview tabs
  and the stage, instead of inside the preview panel where it read as part of
  the stage chrome.

## [0.0.100] - 2026-07-17

### Changed

- Fullscreen is now truly full screen: the button hides the top bar as well as
  the sidebar. To leave, move the pointer into the top-left corner — an
  **Exit fullscreen** button fades in — or press Esc.

## [0.0.99] - 2026-07-16

### Added

- `mcp` config option (default `true`): whether `sdocs dev` serves the MCP
  server. On, the dev server also shows an **MCP** button in the top bar (next
  to the theme toggle) that opens the connection info — the HTTP endpoint, the
  stdio command, and the tool list. `mcp: false` removes the endpoint and the
  button; the explicit `sdocs mcp` command is unaffected.
- When the Explorer runs inside an iframe (the editor's docs tab, any
  embedding page), it posts its route to the parent frame on every navigation
  (`{ type: 'sdocs:route', href }`), so the host can restore the location
  after a reload or server restart.

## [0.0.98] - 2026-07-16

### Added

- `sdocs mcp` — an MCP server with authoring tools, built directly on the
  shipped parser and extractor: `validate_sdoc` (diagnostics with 1-based
  positions plus the entities found), `scaffold_component_doc` (a starter
  `.sdoc` derived from a component's extracted props — returns text, never
  writes files), `get_authoring_guide` (also served as the
  `sdocs://authoring-guide` resource), `list_docs` (the project's `.sdoc`
  files, their entities, and the components they document), and
  `get_component_api` (a component's full extracted API — props, events,
  snippets, methods, states, CSS custom properties, class/rest forwarding).
  Runs on stdio (`npx sdocs mcp`); while `sdocs dev` runs the same server is
  served at `/mcp` (stateless streamable HTTP, localhost-guarded). Built sites
  carry no MCP endpoint.
- The authoring guide ships in the package as `llms.txt` (the docs site serves
  a synced copy at `/llms.txt`).

### Changed

- Explorer polish: the **Examples** section heading now matches the sidebar
  group labels (small uppercase) with more breathing room between examples,
  and long names in the sidebar trim to an ellipsis instead of wrapping —
  hover for the full name.

### Fixed

- A page inside a plain folder (`title="Components / Button"` with no `:`
  group) showed the full path as its heading and browser-tab title; every page
  now shows just the entity's name — the title's last segment — like `:group`
  pages always did.

## [0.0.97] - 2026-07-13

### Fixed

- `args={{ … }}` accepts `null` as a value, so a nullable prop (e.g. a
  `duration: number | null`) can be seeded from the block header. Previously any
  non-literal value rejected the **whole** args object, so a single `null`
  silently dropped every other arg and the preview fell back to its defaults.

## [0.0.96] - 2026-07-13

### Fixed

- A `[LAYOUT]` preview now fills the height of the frame and scrolls inside it
  when the sketch is taller — like a real browser window — instead of
  collapsing to the content height (which left the canvas short and the
  `background` painting only part of the frame). Component previews still grow
  to their content as before.

## [0.0.95] - 2026-07-12

### Added

- `component={…}` resolves a compound sub-component via member access —
  `component={NavTree.Item}`, `component={Grid.Cell}` — and follows a bare
  identifier through an index module's default export
  (`component={NavTree}` → the root component). A single
  `import NavTree from './index.js'` now documents a whole compound family;
  the separate root/sub-component imports are no longer needed.

### Removed

- **Breaking:** the `[preview]` tag is gone — use `[component]`. (It was a
  short-lived alias; there are no published consumers.)

## [0.0.94] - 2026-07-11

### Changed

- `[component]` is the canonical name for the live component block (renamed
  from `[preview]`). Diagnostics name the tag, the grammar highlights it, and
  the docs use `[component]` throughout.

## [0.0.93] - 2026-07-11

### Added

- Descriptions render inline markdown: `` `code` `` becomes a styled chip
  (like doc prose), `**bold**` and `*italics*` work, and HTML in the text
  stays escaped — in showcase/doc headers, preview and example descriptions,
  and every API-table row.

## [0.0.92] - 2026-07-11

### Added

- Controls distinguish **set** from **unset**. Every set control gets a small
  ✕: on an optional prop it unsets the prop entirely — the attribute leaves
  the shown code and the component renders its own default — while on a
  required prop it resets to the documented default. A changed CSS custom
  property gets the same ✕, returning it to its `var()` fallback.
- Unset text and number inputs are empty with the prop's default as ghost
  placeholder text, instead of displaying the default as if it were typed.

### Changed

- An empty string is a real value: clearing an input keeps the prop set to
  `""` (the code shows `name=""`); only the ✕ unsets it.

## [0.0.91] - 2026-07-11

### Added

- `[LAYOUT]` entities accept `background` and `minHeight`, so a full-page
  composition can paint its canvas and claim its height without a wrapper
  element; matching `content.layout` config defaults (and completions) ship
  with them.

### Fixed

- A union prop type written across lines (the Prettier wrap: leading-pipe
  members) now generates a select control, exactly like its single-line form.
- A select for an enum prop with no default now shows a disabled
  "Please select…" placeholder instead of silently displaying the first
  option as if it were chosen.
- Prop descriptions keep their whole JSDoc text: hard-wrapped lines rejoin
  into their sentence (list items keep their breaks), and the props table
  renders the description across the full row instead of clipping it to the
  Details column.
- A doc added in a brand-new directory is picked up live: the dev server
  watches each include pattern's root recursively instead of only the
  directories that existed at startup.
- CSS custom properties from the Controls only reach the preview stage once
  they differ from the documented default — a seeded default no longer
  cascades into nested components that read the same variable and override
  their own fallbacks. Clearing a var back to its default also removes it
  from the stage again.

## [0.0.90] - 2026-07-09

### Fixed

- The prop table no longer renders a blank chip for a union type written with a
  leading `|`, as multi-line unions commonly are.
- A `[preview]`/`[example]` stage with a `maxWidth` now honours `contentX` for
  its horizontal position (left by default) instead of always centering.
  Full-page (LAYOUT) stages still center.

## [0.0.89] - 2026-07-09

### Fixed

- Prop extraction now reads a component's instance `<script>` even when a
  `<script module>` block comes first, so components with a module script no
  longer show an empty API table.

## [0.0.88] - 2026-07-09

### Added

- `minHeight` — a stage sizing attribute for `[preview]` and `[example]` blocks
  and the `content.showcase` config. It reserves a minimum height on the preview
  stage so content that overflows the box — an open dropdown, a popover — is no
  longer clipped by the auto-sized iframe. Resolves through the usual
  config → entity → block cascade.

## [0.0.87] - 2026-07-08

### Fixed

- Custom elements whose name merely starts with `style` or `script`
  (`<styled-note>`, `<script-demo>`) are no longer captured as style/script
  tags — previously they triggered a bogus "missing closer" error and silently
  dropped the rest of the body, at file, entity, and block level alike. The
  grammar got the same tag-boundary rule, so they highlight as ordinary markup.
- Reserved-name checking now covers the whole scope ladder: a file
  `<script>` declaring `args`, `__sdocsRef`, or `__sdocsExample` (or calling
  `$props()`), and destructured bindings like `const { args } = …`, are
  diagnosed at parse time instead of breaking every stage at runtime. PAGE
  entity scripts keep their `args` exemption.
- Import scanning is now string-aware everywhere: import-shaped lines inside
  template literals no longer produce false duplicate-import errors, leak
  absolute file paths into runtime strings, or feed the wrong file to props
  extraction.
- `[example title={expression}]` now fails the build like a missing title —
  the mandatory-title rule can no longer be bypassed with a non-string value.
- Preview and example slugs can no longer collide (`x-ray` vs `Ray`):
  colliding example slugs de-collide deterministically with a warning naming
  both titles, so builds stop emitting duplicate chunks.
- A quoted `>` inside a script tag's attributes (e.g. TypeScript
  `generics="Record<string, number>"`) no longer corrupts the captured
  content.
- Markdown fences now follow CommonMark closing rules end to end (scanner,
  projection, page islands, grammar): a ``` line inside a `~~~` fence is
  literal content, a fenced `[/DOC]` no longer ends the entity region in the
  editor's coloring, and fenced component tags stay displayed code.
- A code fence directly after a misplaced DOC `<style>` no longer lets the
  style apply twice; the misplaced style demotes to prose with a diagnostic,
  same as when prose follows it.
- `bind:this` injection for previews no longer fires inside attribute-value
  strings and is only suppressed by a bind on the targeted element itself.
- Escaped `\[` lines unescape at any indentation, not just at the common
  indent.
- Entity styles and DOC prose get full editor intelligence: per-entity virtual
  docs now cover SHOWCASE/DOC entity scripts and styles, an entity import used
  only by a later block no longer grays out as unused, and style tags with
  code on the opening line keep that code in the virtual documents.

## [0.0.86] - 2026-07-08

### Added

- **Entity-level `<script>` and `<style>` — the scope ladder completes.**
  One rule at every level: any container can open with a script and close
  with a style, and scopes nest lexically (file → entity → block). An entity
  script placed after the `[SHOWCASE]`/`[DOC]`/`[PAGE]`/`[LAYOUT]`
  opener is shared by that entity's blocks and body; its style joins the
  entity's stages (and the page component for PAGE/DOC/LAYOUT). Re-importing
  an identifier an outer scope already binds is an error; `component={X}`
  resolves through entity imports too. A `[PAGE]` with its own script and
  style is now a fully self-contained page component.

## [0.0.85] - 2026-07-08

### Added

- **`description` on previews and examples.** A short text rendered above a
  preview's stage or under an example's heading — the block can now say what
  it demonstrates.

### Changed

- **The code panel shows runnable code, not `{...args}`.** A plain spread
  resolves to the current control values as concrete attributes — nothing set
  shows `<X />`, edits appear as real props. A body that uses `args` in
  richer ways (`{args.x}`, `foo={args}`) instead gains a genuine
  `const args = { … }` script line, so the shown code always runs as
  written.
- **Missing example titles fail the build.** `title` on `[example]` was
  always required but only warned; `sdocs build` now fails with the file and
  position, and dev renders a loud "⚠ title required" heading instead of an
  untitled stage.
- **`--foo=` component props color like their sibling attributes** in
  editor and code panels, instead of Svelte's CSS-property scope — values
  keep their own string/expression coloring.

## [0.0.84] - 2026-07-08

## [0.0.84] - 2026-07-08

### Fixed

- **The color control resolves `var()` defaults.** A CSS prop whose default
  is a token reference (`--background` defaulting to `var(--focus)`) used
  to show a black swatch — a native color input can't parse a var(). The
  value is now resolved to its computed color inside the preview iframe,
  where the project's theme actually lives, so the swatch shows the real
  token color.

### Changed

- **Component Source sits under Preview Code.** The component's source panel
  moves from the bottom of the page (below Examples) to directly beneath the
  Preview Code panel — usage first, implementation second, both collapsed
  under the stage.

## [0.0.83] - 2026-07-08

### Fixed

- **Stage assets survive sub-path deploys.** Preview/example pages now carry
  a `<base href>` set to the build's base, so base-relative asset references
  (`src="hero.png"`, `url('hero.png')`, a `path="icons/x.svg"` prop)
  resolve against the static folder in dev and in a build deployed under a
  sub-path (`--base "/repo/"`) alike. Root-absolute `/x` URLs keep their
  usual meaning — the domain root — which is why they broke under GitHub
  project Pages. Applies to dev previews, embedded builds, and CLI builds.

## [0.0.82] - 2026-07-08

### Added

- **Stage `background`.** Preview/example stages accept a background —
  declared in `sdocs.config` (`content.showcase.background`), on the
  entity, or per block (`background="var(--bg)"`), cascading like the other
  stage attributes. The value is a CSS color or a `var()` resolved against
  the project's own css inside the stage iframe.
- **"Mixed" CSS-prop defaults.** When a documented CSS var is used with
  different `var()` fallbacks across properties, the Default column shows
  Mixed with a per-property breakdown on hover, instead of silently picking
  the first fallback. A `--x: value` declaration on the component's root now
  wins as the default, and commented-out CSS no longer counts.

### Changed

- **Grouped titles drop the group from the page title.** A showcase titled
  `:Group / Name` shows just "Name" as its heading and browser-tab title —
  the sidebar already carries the grouping.

## [0.0.81] - 2026-07-08

### Added

- **Block-level `<script>` and `<style>` in previews and examples.** A
  `[preview]`/`[example]` body can open with its own `<script>` and close
  with its own `<style>` — a full mini component. Scoping is lexical: the
  file script/style are visible to every block; a block's script and style are
  visible only in that block, so sibling examples can each declare their own
  state. Block scripts are real scripts (imports, `$state`, functions;
  `args` in scope); re-importing an identifier the file script already
  imports is reported as an error, and a block's `component={X}` can resolve
  through the block's own imports. Styles are injected into the block's stage.
  The grammar highlights block scripts/styles (embedded TS/JS/CSS), and code
  panels show the complete script + markup + style.

### Fixed

- **File-level `<style>` now actually reaches the stages.** It was parsed
  and documented as applying to the file's previews and examples but never
  wired into the generated stage modules — selectors silently did nothing.

## [0.0.80] - 2026-07-08

### Fixed

- **`class` and `...rest` forwarding render as chips, not prop rows.** The
  standard forwarding shape — `interface Props extends HTMLAttributes<…>` with
  a merged `class` and a `{...rest}` spread on the root element — used to
  pollute the props table: `...rest` was mis-read as a prop and `class` showed
  as a required row. Both are now recognized as forwarding infrastructure and
  shown as small chips under the props table ("Also forwarded to the root
  element"), with the rest chip labeled by the extended type when the interface
  declares one. Detection reads the `$props()` destructuring itself, so it
  works identically in TypeScript, plain JS, and JSDoc-typed components; an
  explicit `class?: string` interface member is treated the same way.

## [0.0.79] - 2026-07-07

### Fixed

- **Multi-line block openers highlight correctly.** In the syntax highlighter
  used by the component browser, an opener split across several lines — one
  attribute per line with the closing `]` on its own line — now colors its
  attribute lines and standalone `]`. An expression value on its own line
  (such as `args={{ … }}`) no longer leaks into the block body below it.

## [0.0.78] - 2026-07-07

### Changed

- **Union type badges split per member.** A prop typed `number | string` now
  renders as separate, individually-colored chips (an orange `number` and a
  green `string`) instead of one gray badge — matching how literal unions
  (`'sm' | 'md'`) already split. The splitter is nesting-aware, so a `|`
  inside `Array<A | B>`, an object type, or an arrow's `=>` is left intact.
- **CSS Props lists only `@cssvar`-annotated custom properties.** The table
  is now the component's declared CSS API, not every `var(--…)` the styles
  happen to reference — internal wiring vars (e.g. a mask URL held in a
  `--icon` var) no longer leak into the docs. Documented props still take
  their default from the style's `var(--x, default)` fallback.

## [0.0.77] - 2026-07-07

### Added

- **String-permitting union props get a text control.** A prop typed
  `number | string` (or any union that allows a string) previously showed no
  control at all — only literal-value unions (`'sm' | 'md'`) became a select.
  Such props now render a text box. When the type also allows a number, a
  plain-numeric entry is coerced back to a number, so a `number | string`
  "a bare number means px" convention keeps working through the control.

## [0.0.76] - 2026-07-07

### Added

- **Preview tabs are deep-linkable.** In a component doc with several
  `[preview]` blocks, the selected tab is mirrored in the URL as
  `?tab=<preview-slug>`, so a specific preview can be linked or shared
  (`…/navtree?tab=navtree-item`). Loading such a URL opens that tab; the
  first tab stays the default (clean URL), and navigating to another entity
  drops the parameter. Hydration-safe: the prerendered page shows the
  default tab and switches after mount.

## [0.0.75] - 2026-07-07

### Fixed

- **No light→dark flash on `CodeBlock`.** The pre-highlight fallback (also
  what the prerendered HTML shows until hydration) now matches shiki's dark
  stage instead of a light gray box, so when the highlighter finishes the
  swap only adds syntax colors — the background no longer flips.

## [0.0.74] - 2026-07-07

### Added

- **`sdocs build` prerenders every route.** Each emitted `index.html` now
  contains the page's real HTML — sidebar, prose, Svelte pages — rendered
  through Svelte's server renderer, plus a per-route `<title>` and, for
  showcases, the `description` as the page's meta description. The app
  hydrates on load and behaves as the same SPA afterwards; crawlers,
  link-preview bots, and no-JS readers get full pages. Dev (`sdocs dev`
  / `run`) stays a live client-rendered SPA. A route whose server render
  throws falls back to client rendering with a build warning, and
  `404.html` stays a bare shell so unknown paths boot the app.
- **The tab title follows the route.** Client-side navigation updates
  `document.title` to the same `Page – Site` shape the build prerenders.

## [0.0.73] - 2026-07-06

### Changed

- **An example's own page shows the example itself.** Opening an example
  from the sidebar renders its stage directly under the title — the
  "Preview" accordion wrapper is gone; only the collapsed Code panel
  remains below.
- **Code panels sit flush.** Every collapsible code panel (example Code,
  Preview Code, Component Source) drops the padding around the block and
  the block's rounded corners — the code fills the panel edge to edge.

## [0.0.72] - 2026-07-06

### Changed

- **`[PAGE]` split into `[DOC]` and `[PAGE]`.** The markdown-prose entity is
  now `[DOC]` — same body, same attributes (`toc`, `contentX`, examples,
  islands), new name. `[PAGE]` now means a page you *build*: a plain Svelte
  body rendered as a real page of the docs app — docs-context CSS, no stage
  tooling, no toc — inside the same max-width container DOCs use
  (`maxWidth`, `padding`, `contentX`; `maxWidth="100%"` for full-bleed).
  The config key follows: `content.doc` holds the old `content.page`
  defaults, and `content.page` now sizes Svelte pages.

### Added

- **Sectionless pages.** A `[PAGE]` without a `@section/` title prefix
  routes at the **site root** (`title="Welcome"` → `/welcome`) with no
  sidebar and no active tab — landing pages, `/pricing`-style routes. Point
  `home` at one for a landing page. Only PAGE may be sectionless; a root
  route that shadows a section slug or `/about` is a build error.
- **`CodeBlock` component.** `import { CodeBlock } from 'sdocs/ui'` renders
  highlighted code inside Svelte pages — any bundled shiki language plus
  `sdoc` itself, loaded lazily in the browser. Resolves in standalone
  projects too (the CLI provides its own copy).

### Fixed

- **Import rewriting no longer reaches into string literals.** The script
  prelude's relative-import resolution now anchors to real import
  statements, so an import-shaped line inside a string — a code sample fed
  to `CodeBlock`, say — stays exactly as written.

## [0.0.71] - 2026-07-06

### Added

- **` ```sdoc ` fences highlight in pages.** The shipped sdoc TextMate
  grammar is registered with the highlighter, so fenced code blocks
  labeled `sdoc` render block tags, attributes, and embedded Svelte with
  full colors instead of plaintext.

## [0.0.70] - 2026-07-06

### Fixed

- **Root-absolute URLs in page markdown resolve under a sub-path deploy.**
  `![x](/sample.svg)` and `[link](/guides/colors)` in a page refer to the
  site root; on a base deploy (GitHub project Pages) they now get the base
  prefix at build time, so images load and absolute internal links route.

## [0.0.69] - 2026-07-06

### Changed

- **The top bar always renders.** Previously it appeared only with two or
  more declared sections; now every site gets the full-width bar — brand,
  section tabs (a lone "Docs" tab in zero-config projects, highlighted on
  any doc route), stylesheet picker, theme and fullscreen controls — and
  the sidebar is always just search + tree. One consistent layout in every
  project and in embedded mode.

## [0.0.68] - 2026-07-06

### Changed

- **BREAKING: sections are declared, validated, and slug-referenced.** The
  config's `sections` is now an array of `{ slug, title?, order? }` objects
  in top-bar order; titles reference sections by slug
  (`title="@guides/Installation"`). An unknown `@section`, two entities on
  one route, or an unresolvable `home` renders a full-page error in dev and
  **fails `sdocs build`** — a broken structure can't deploy. Route
  collisions no longer auto-number. `defaultSection`, `sidebar.order`, and
  `sidebar.open` are removed: unprefixed titles belong to a declared (or,
  with no sections, the implicit) `docs` section, and sidebar ordering
  lives in each section's `order` array of route paths (listed first,
  alphabetical after).
- **BREAKING: the landing page moves to config.** `home: 'guides/introduction'`
  (a route path) replaces the `home` flag on `[PAGE]`. The home entity stays
  listed in its sidebar; the new bare `hide` flag on any entity keeps it
  routable but unlisted.

### Added

- **`slug` attribute on entities** — overrides the URL segment
  (`slug="my-page"`; lowercase letters, digits, hyphens); the escape hatch
  for route collisions.
- **`hide` attribute on entities** — routable, never listed in a sidebar.

## [0.0.67] - 2026-07-06

### Changed

- **BREAKING: the `[DOCS]` entity is renamed `[SHOWCASE]`.** Component
  documentation blocks are now `[SHOWCASE title="…"] … [/SHOWCASE]`, and the
  `content.docs` config key is now `content.showcase`. Rename both in your
  `.sdoc` files and `sdocs.config`. Everything else — the per-component
  "Docs" overview tab, `[PAGE]`, `[LAYOUT]`, `[preview]`, `[example]` — is
  unchanged. No `[DOCS]` alias is kept.

## [0.0.66] - 2026-07-06

### Added

- **`favicon` config option.** Point the browser-tab icon at a static asset
  (`favicon: '/logo.svg'`) or URL; defaults to the built-in sdocs icon. It's
  base-prefixed on build like other assets.

### Fixed

- **A root-absolute `logo` path resolves under a sub-path deploy.** The
  header logo is an image the Explorer renders at runtime, so (unlike assets
  in the HTML) it wasn't getting the `base` prefix and 404'd on a project
  Pages site; it's now prefixed with the base.

## [0.0.65] - 2026-07-06

### Fixed

- **`sdocs build` no longer minifies the project's CSS.** Vite 8's default
  minifier (lightningcss) is a strict parser that rejects custom-property
  names browsers accept (e.g. `--bg+100`), so a project whose stylesheet
  used them failed to build. The project's CSS is served verbatim now; JS is
  still minified.

## [0.0.64] - 2026-07-06

### Added

- **`base` path for `sdocs build`.** Deploy under a sub-path — a GitHub
  project Pages site at `/<repo>/`, say — by setting `base` in the config
  or passing `--base /repo/` on the CLI (which overrides the config, so CI
  can derive it from the repo name). Asset URLs and history routes are
  prefixed with it; `sdocs dev` still serves at the root. The build also
  emits a `404.html` (a copy of the shell) so an unknown deep link boots the
  app on a static host instead of a bare 404.

## [0.0.63] - 2026-07-06

### Added

- **`home` page.** Mark any `[PAGE]` with the bare `home` flag
  (`[PAGE title="Introduction" home]`) to make it the site's landing page:
  it renders at the root route, is linked by the logo/title, and never
  appears in a sidebar. First `home` wins.
- **About page at `/about`.** The former stats/mascot landing screen is now
  an About page — project logo, doc counts, and the sdocs version that
  built the site — always reachable at `/about`. It's the automatic landing
  page whenever no page is marked `home`.

### Fixed

- `sdocs --version` reported `unknown` (wrong package.json path); it now
  prints the real version.

## [0.0.62] - 2026-07-06

### Fixed

- **Short pages no longer highlight the last TOC entry.** The scrollspy's
  bottom-of-scroll snap only applies when the page actually scrolls; a page
  that fits the viewport highlights its first section.

## [0.0.61] - 2026-07-06

### Added

- **Sections: full documentation sites in the Explorer.** An `@Section/`
  prefix on any entity title (`[PAGE title="@Guides/Installation"]`) groups
  docs under a full-width top bar, each section with its own sidebar — mix
  pages-only sections with component sections freely. Docs without a prefix
  land in a configurable default section (`defaultSection`, default
  `Docs`); the bar only appears once a second section exists, so existing
  projects look unchanged. Tab order comes from the new `sections` config
  (unlisted sections follow alphabetically).
- **Real URLs (history routing).** Doc routes are now slugified paths —
  `/components/button/sizes` instead of `#/Components/Button/Sizes`. The
  CLI dev server serves the shell for any path, `sdocs build` emits an
  `index.html` per route (deep links work on GitHub Pages with no rewrite
  rules), and old `#/` bookmarks translate on load. Embedding keeps hash
  URLs by default; the new `routing` config/prop switches either way, and
  section-less links resolve into the default section.

### Changed

- **Config/prop rename: `title` + `logo`.** `title` is the header text
  (was `logo`), `logo` the mascot image (was `icon`). Old configs with an
  `icon` key are mapped automatically (with a console note); the `icon`
  Explorer prop still works as an alias.

## [0.0.60] - 2026-07-06

### Added

- **The page table of contents highlights the current section.** As the
  page scrolls, the "On this page" entry for the section in view lights up;
  clicking an entry highlights it immediately and holds it through the
  smooth scroll.

## [0.0.59] - 2026-07-05

### Changed

- **Code blocks render on a dark stage.** Highlighted code — page fences and
  the code panels — always uses the dark syntax theme, so blocks read as
  code at a glance in both app themes (they previously rendered white-on-white
  in light mode).
- **A page's body `#` title matches the entity title size** (24px/700) — it
  is the page title, after all.

### Fixed

- **Every fence gets a themed block.** `bash`, `json`, `markdown`, `yaml`,
  and `diff` fences highlight properly, and unknown languages fall back to a
  plaintext shiki block instead of an unstyled bare `<pre>`.

## [0.0.58] - 2026-07-05

### Added

- **Richer page markdown.** GitHub-style alerts (`> [!NOTE]`, `[!TIP]`,
  `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) render as tinted callouts;
  task lists get proper checkboxes; table columns honor `:---:` alignment;
  external links open in a new tab (internal ones stay in the app); images
  render lazily and Svelte-safe.
- **`static` config option.** A folder of static assets served at the site
  root in dev and copied into `dist/` by `sdocs build` — `![hero](/hero.png)`
  in a page just works. Powers the standalone CLI flows; embedded apps keep
  using the host's public directory.
- **Page column alignment.** `content.page.contentX` (config) and
  `contentX` on `[PAGE]` align the content column `left`/`center`/`right`.
- **A body `#` heading takes over as the page title** — the header no longer
  duplicates it; the entity `title` keeps naming the sidebar entry.

### Changed

- **A page's `maxWidth` now bounds the content column together with its
  table of contents**; when the toc is hidden the prose takes its space.

### Fixed

- **Code fences can show component tags.** A `<Component />` line inside a
  markdown fence, preceded by a blank line, was treated as a live Svelte
  island and rendered (or crashed the page) instead of staying highlighted
  code. Fences now shield island detection, matching the scanner and the
  editor projection.

## [0.0.57] - 2026-07-05

### Added

- **`[example]` blocks inside `[PAGE]`.** Pages can now stage real code in
  the project's context, mid-prose: an example renders in place on an
  isolated iframe stage that loads the configured `css`, with a collapsed
  code panel — exactly like an example in `[DOCS]`. Stage attributes
  (`maxWidth`, `padding`, `direction`, `gap`, `contentX`, `contentY`)
  cascade from `content.docs`. Titles are required and unique per page;
  markdown fences shield block syntax, so a fence may show `[example]`
  without escaping.

### Changed

- **Page prose renders natively in the Explorer**, with the docs app's own
  typography — no longer inside an iframe that loads the project `css`. The
  boundary is now crisp: documentation is docs-styled, stages are
  project-styled. Pages gain real markdown styling (headings, lists, tables,
  code), direct table-of-contents scrolling, and native text flow. Svelte
  islands still work and run in the docs context — showcase code belongs in
  `[example]` blocks.
- **Embedded hosts pass `pageModules`.** `virtual:sdocs` now exports
  `pageModules`; forward it to `<Explorer {docs} {cssNames} {pageModules}>`
  so pages render their content. Hosts that don't pass it show page examples
  and headers but no body.

## [0.0.56] - 2026-07-05

### Added

- **`configSchema` in `sdocs/language`** — a structured description of the
  `sdocs.config.*` shape (keys, documentation, and value enums) mirroring
  `SdocsConfig`. Editor tooling reads it to complete the config file in
  projects that don't install `sdocs`, so config completion can't drift from
  the config type.

## [0.0.55] - 2026-07-05

### Changed

- **Renamed the stage alignment attributes** `align`/`alignY` (added in
  0.0.54) to **`contentX`**/**`contentY`** — for horizontal/vertical content
  alignment on `[preview]`/`[example]` and their `content.docs` and `[DOCS]`
  defaults. Values and direction-aware behavior are unchanged.

## [0.0.54] - 2026-07-05

### Added

- **Stage alignment on previews and examples.** Two direction-aware
  attributes (also settable per-kind in `content.docs` and on `[DOCS]`):
  `align` — horizontal (`left`/`center`/`right`/`justify`) — and `alignY` —
  vertical (`top`/`middle`/`bottom`/`justify`). sdocs maps each to the right
  flex property for the current `direction`, so `align="center"` centers
  horizontally in a row or a column; `justify` spreads items along the flow.
- **`attributeRules(kind)` in `sdocs/language`** — the allowed attributes and
  value shapes for a block kind, the single source of truth behind both
  diagnostics and the VS Code extension's attribute completions.

## [0.0.53] - 2026-07-05

### Added

- **Content layout is configurable — globally and in place.** The config's
  `content` option sets per-kind defaults, and the same names work as entity
  and block attributes (block beats entity beats config):
  - `maxWidth` — the content column for `[DOCS]`/`[PAGE]` (default `1200px`),
    the stage for `[LAYOUT]` (default `100%`) and for `[preview]`/`[example]`
    (default `100%`; narrower stages center).
  - `padding` — page content `32px`, preview/example stages `16px`
    (settable on `[DOCS]` as the entity default), layout stages `0px`.
  - `direction` / `gap` — preview/example stages are flex containers:
    `flex-direction` (default `row`) and `gap` (default `16px`).
  - `toc` — `[PAGE]` table-of-contents visibility (default `true`;
    `toc="false"` hides it).

## [0.0.52] - 2026-07-05

### Added

- **Svelte islands in `[PAGE]` bodies.** A line opening a component/HTML tag
  or a Svelte block (`{#snippet`, `{@render`) after a blank line starts an
  island that passes to Svelte verbatim, until its tags and blocks balance —
  blank lines inside are fine. Markdown can no longer split a snippet across
  paragraphs or cut an HTML section in half. Snippets declared anywhere on
  the page are renderable from anywhere (they land at the top level of the
  compiled fragment), so one `{#snippet}` can serve many sections.
- **Svelte coloring inside page bodies.** `{#…}…{/…}` blocks highlight as
  Svelte throughout — keywords, typed params, and the markup inside them —
  and `{@…}` tags color as keywords with TypeScript interiors, instead of
  HTML-guess colors. Fenced code and inline code stay inert.

## [0.0.51] - 2026-07-05

### Changed

- **The sdoc grammar colors `[PAGE]` bodies as markdown.** Headings, bold,
  lists, and fences highlight in page prose (the body's block indent is
  accounted for, so indented bodies don't read as code blocks). Applies
  everywhere the grammar is used — the VS Code extension and ` ```sdoc `
  fences on the site.

### Fixed

- **Page expressions with string literals no longer break the page.** The
  markdown pass HTML-escaped quotes (and `&&`, `<`) inside `{…}` expressions,
  so `{@render colorBox("#ff0000")}` or `{format("x")}` in a `[PAGE]` body
  failed to compile. Balanced `{…}` spans now pass through verbatim; prose
  around them escapes exactly as before, and code fences and inline code stay
  inert.

### Added

- **`\{` escapes a literal brace in page prose.** Previously a lone brace
  written in prose could break the page; a backslash-escaped brace now renders
  as an inert literal `{`.

## [0.0.50] - 2026-07-05

### Fixed

- **The last block of a page no longer gets clipped.** Preview iframes size
  themselves to the preview root's `scrollHeight`, but the first and last
  child's margins collapsed through that root and weren't counted — so the
  final block of `[PAGE]` content (a closing paragraph, a raw HTML block)
  was cut off. The preview root is now a block formatting context
  (`display: flow-root`), so the reported height includes everything.

## [0.0.49] - 2026-07-05

### Fixed

- **The `:` group marker no longer leaks into page headings.** A title like
  `:Group / Name` groups an entry in the sidebar, but the leading colon was
  rendered verbatim in the component/page `<h1>`. Headings now strip it, so the
  title reads `Group / Name`.

## [0.0.48] - 2026-07-05

### Changed

- **Empty API sections are hidden on component pages.** Props, CSS Props,
  Events, Snippets, Methods, and States sections now render only when the
  component actually has entries for them, instead of every section always
  showing with a "None" placeholder.

## [0.0.47] - 2026-07-05

### Fixed

- **Shared values in the file `<script>` reach previews and examples.** The
  pipeline lifted only `import` lines into a preview, so a shared value like
  `const options = […]` was `undefined` at render time even though the
  language reference promises the file script's shared values are available
  to every entity. The whole file script (imports and declarations) is now
  lifted, with its relative imports resolved.

### Changed

- Test files moved out of `src/lib` into `tests/` — they no longer ship
  compiled inside the published package.

## [0.0.46] - 2026-07-04

### Fixed

- **`npx sdocs` works in projects without a local install again.** The
  Explorer's lazy syntax highlighter (added in 0.0.36) imports `shiki`,
  which a bare project couldn't resolve from the staging directory — the
  dev server failed with `Failed to resolve import "shiki/core"`. The
  staging directory now links sdocs' own `shiki` (and `svelte`, when the
  project has none) into place; a project-local `svelte` still wins.

## [0.0.45] - 2026-07-04

### Fixed

- **The sdoc grammar survives multi-block files.** The embedded Svelte
  grammar opens a text region after any line ending in `>` that only closes
  at the next `<` or `{` — it swallowed block closers, leaving everything
  after the first `[preview]` uncolored. Block bodies now embed Svelte
  behind line-guarded regions (the mechanism markdown fences use), so
  closers, sibling blocks, and later entities all highlight correctly.

## [0.0.44] - 2026-07-04

### Changed

- The README documents the block format — the npm listing previously showed
  the retired `export const meta` convention.

## [0.0.43] - 2026-07-04

### Added

- **`projectSdoc` in `sdocs/language`** — a line-preserving projection of a
  `.sdoc` file onto a virtual Svelte document: every authored line keeps its
  exact position, sub-block openers become the same `{#snippet}` wrappers
  the build generates, PAGE prose stays live with code regions masked, and
  a trailer past the authored end marks everything as used. This is the
  foundation of the VS Code extension's sdoc language server.

### Changed

- The Explorer's own UI library docs (`src/lib/ui/*.sdoc`) are converted to
  the block format.

## [0.0.42] - 2026-07-04

### Changed

- **Breaking: `.sdoc` files are the block format.** A doc file is now
  `<script>` on top, `[DOCS]`/`[PAGE]`/`[LAYOUT]` entity blocks in the
  middle, `<style>` at the bottom — the language documented in the site's
  Language section. Each entity is its own sidebar entry, so one file can
  hold several. The `export const meta` convention, `{#snippet}` extraction,
  auto-generated `Default` previews, and the `.page.sdoc`/`.layout.sdoc`
  filename kinds are gone.
- **`[DOCS]` holds any number of previews.** Each
  `[preview component={X} args={{…}}]` is self-contained; several render as
  tabs, each a fully live panel with its own controls, extracted API tables,
  and component source. `[example title="…"]` blocks are frozen and render
  page-level below the tabs.
- **`[PAGE]` bodies are markdown** — GFM with `{expression}` interpolation
  and Svelte component islands; code fences and inline code are inert. The
  table of contents comes from the markdown headings.
- **Parsing never crashes the dev server.** Doc files parse through the
  `sdocs/language` scanner; mistakes surface as file:line warnings and the
  rest of the file keeps working.
- **Breaking for embedders:** `DocEntry` is reshaped (`previews`/`examples`/
  `content` replace `snippets`/`componentData`), and preview URLs address
  entities as `path#slug`.

## [0.0.41] - 2026-07-04

### Added

- **`sdocs/language`** — a scanner and parser for the block-based sdoc
  format: line-anchored `[DOCS]`/`[PAGE]`/`[LAYOUT]` entities with
  `[preview]`/`[example]` sub-blocks, Svelte-style attributes, precise
  source spans, and recoverable diagnostics (it never throws, and keeps
  scanning past mistakes). Groundwork for the format switch — the runtime
  still reads the current `.sdoc` format.
- **A TextMate grammar for sdoc** at `sdocs/grammar/sdoc.tmLanguage.json`,
  usable by any TextMate-compatible highlighter; the documentation site
  uses it to highlight ```` ```sdoc ```` fences.

## [0.0.40] - 2026-07-04

### Fixed

- **Wrapped previews bind to the documented component.** When a preview
  wraps the documented component in another one (a `<Tab>` shown inside
  `<Tabs>`), method calls and live state used to attach to the outer
  wrapper — the first capitalized tag in the snippet. The preview ref now
  binds to the doc's own component wherever it appears in the snippet,
  falling back to the first capitalized tag when it's absent.
- **Usage-code patching matches the component name exactly.** Attribute
  updates from the controls located the root tag with a prefix search, so
  a component like `Tab` could patch a sibling `<Tabs>` tag instead of its
  own. The tag search now requires a whole-name match.

## [0.0.39] - 2026-07-04

### Changed

- **Methods and States join the unified section layout.** Methods render a
  single signature chip (`(params) => returns`, colored like events) with
  the Run button in the control rail; States show their live value in a
  "Current value" rail. The value rail widens to align section right edges
  when it's the last column. All six sections now share one table
  implementation.
- **JSDoc types display like TypeScript types.** `import('module').`
  qualifiers are stripped for display and classification, so
  `import('svelte').Snippet<[…]>` renders as the same pink `Snippet<[…]>`
  chip as in TS components.

## [0.0.38] - 2026-07-04

### Changed

- Names in the API tables are slightly larger (14px), giving each row a
  clearer anchor.

## [0.0.37] - 2026-07-03

### Changed

- **The component page is a live API reference.** The separate Controls
  panel is gone — controls sit inside the API tables, on the row of the
  prop or CSS custom property they drive. Props, CSS Props, Events, and
  Snippets share a composite row layout: name (with a red `*` when
  required), type and description stacked in the middle, an explicit
  Default column (`—` when absent), and a fixed control rail. Reset moved
  next to the Props title.
- **Sections instead of collapsible panels.** The reference sections render
  flat with icon titles; only the preview and its code stay in the bordered
  card (Preview Code still collapses). "State" is now "States", matching
  the plural sibling sections. The page grew to 1120px.
- **Color-coded types and values.** Type chips are tinted by kind — strings
  green, numbers and dimensions amber, booleans purple, callbacks blue,
  snippets pink, colors cyan, `void` slate — union members render as
  individual chips, and default/state literals are colored plain text.
  Both themes are handled explicitly.

### Added

- **Run buttons for methods.** Zero-argument methods can be invoked
  directly from the Methods table and act on the live preview; methods
  with parameters show a disabled button.
- **Live state values.** The States table shows each exported state's
  current value, streamed from the preview as it changes.
- Section icons (sliders, palette, zap, function, database) join the UI
  icon set.

## [0.0.36] - 2026-07-03

### Fixed

- **Usage code is syntax-highlighted in static builds.** The usage snippet
  regenerates in the browser as controls change and used to be highlighted
  through a dev-server endpoint — deployed builds fell back to plain text.
  Highlighting now runs client-side (lazy-loaded Shiki with the JavaScript
  regex engine), identical on the dev server and any static host; the
  dev-server endpoint is gone.

## [0.0.35] - 2026-07-03

### Fixed

- **The embedded Explorer guards its typography.** Host apps commonly style
  bare `code`, `pre`, and `a` elements; those rules reached into the
  Explorer's UI (shrinking code blocks, recoloring links). The Explorer now
  pins its own font family, sizing, and link color at the `.sdocs-app`
  boundary. Hosts with higher-specificity global rules should still scope
  them away from `.sdocs-app`.

## [0.0.34] - 2026-07-03

### Fixed

- **Preview paths are short and project-relative.** Preview URLs and emitted
  file names used to encode the doc's absolute filesystem path, which leaked
  the machine's directory layout into published sites and produced path
  segments long enough for GitHub Pages to reject the deployment. Paths are
  now encoded relative to the project root.

## [0.0.33] - 2026-07-03

### Added

- **Embedded apps can deploy under a sub-path.** Preview URLs pick up the
  host Vite `base` automatically; SvelteKit apps (whose base Vite doesn't
  see) pass it explicitly via the new `previewBase` prop on `Explorer` —
  e.g. `previewBase={base}` with `base` from `$app/paths`.

## [0.0.32] - 2026-07-03

### Changed

- **Breaking: the embedded component is the Explorer now.** Import
  `Explorer` from `sdocs/explorer` instead of `App` from `sdocs/client` —
  same component and props, named for what it is. The CLI help and
  generated app use the same naming.

## [0.0.31] - 2026-07-03

### Added

- **`icon` config option** — the sidebar header icon is now configurable:
  `'sdocs'` shows the built-in mascot (the default), any other string is
  used as an image URL, and `false` hides it.

## [0.0.30] - 2026-07-03

### Fixed

- The `sdocs dev`/`run` explorer UI rendered unstyled since 0.0.28: with the
  staging directory under `node_modules`, the Svelte plugin doesn't serve
  virtual CSS modules for the client's components. Styles are now compiled
  into the components in dev. (Static builds were unaffected.)

### Added

- The package exports `./package.json`.

## [0.0.29] - 2026-07-03

### Fixed

- `sdocs dev`/`run` no longer floods the console with unresolved-import
  errors on Vite 8 (its rolldown-based dependency scanner can't walk `.svelte`
  entry graphs). The initial scan is skipped — dependencies are still
  optimized on demand — and `svelte` is pre-bundled up front.

## [0.0.28] - 2026-07-03

### Changed

- **`sdocs dev`/`run`/`build` no longer write a `.sdocs/` directory into the
  project.** The generated app is staged in a unique directory under
  `node_modules/.cache/` (imports resolve exactly as before) and removed on
  exit. This also fixes `sdocs build` breaking a concurrently running dev
  server — they previously shared the same staging directory.

## [0.0.27] - 2026-07-03

### Added

- **`sdocs run`** — same as `dev`, built for `npx sdocs run`: works with no
  local install. The dev server allows sdocs' own files from the npx cache,
  and when the project has its own `svelte`, previews dedupe onto it, so
  components and their dependencies always resolve from the project.

### Changed

- `sdocs build` applies the same svelte dedupe as the dev server.

## [0.0.26] - 2026-07-03

### Fixed

- **Embedded production builds now include working previews.** The Vite
  plugin emits each preview as a static page (plus your `css` stylesheets)
  into the host app's client build under `previews/`, and `virtual:sdocs`
  references those pages — preview iframes no longer 404 in deployed apps.
- The standalone CLI (`sdocs dev`/`sdocs build`) failed from an installed
  package: the client app was staged from a wrong path, and its `ui/` styles
  and fonts were not staged at all.
- The docs UI stops calling the dev-only highlight endpoint after the first
  failure in production and falls back to plain code.

## [0.0.25] - 2026-07-02

### Added

- **JSDoc prop extraction for plain-JS components.** Both `@type {{ ... }}`
  object annotations and `@typedef {Object} Props` with `@property` tags on
  the `$props()` declaration are parsed — types, optionality (bracketed
  names), and descriptions all flow into the docs and interactive controls.
- A prop-parser test suite; `npm test` now runs it.

### Fixed

- Props typed as `import('svelte').Snippet` are classified as snippets.

## [0.0.24] - 2026-07-02

### Changed

- Snippets receive `args` as a real snippet parameter: write
  `{#snippet Default(args)}`. Previews render snippets through `{@render}`,
  so `args` is an explicit, editor-visible binding instead of a value injected
  into scope. Parameterless snippets keep working unchanged.

## [0.0.23] - 2026-04-16

First documented release. `sdocs` is a lightweight documentation tool for Svelte 5
components; this entry describes its capabilities as of 0.0.23.

### Added

- **CLI** — `sdocs dev`, `sdocs build`, `sdocs preview`, and `sdocs init`.
- **Vite plugin** (`sdocs/vite`) for embedding the explorer in an existing Vite or
  SvelteKit app, exposing discovered docs through the `virtual:sdocs` module.
- **Three `.sdoc` kinds** — component docs (`.sdoc`), standalone pages
  (`.page.sdoc`), and full-page layouts (`.layout.sdoc`).
- **Prop extraction** from component types, rendered as a props table.
- **Interactive controls** for live-editing component props and CSS custom
  properties.
- **Theming** with light and dark modes and named-stylesheet switching.
- **Configurable sidebar** ordering and hash-based routing.
- **Syntax highlighting** via Shiki.
- Package entry points: `sdocs`, `sdocs/vite`, `sdocs/client`, and `sdocs/ui`.

## [0.0.20] - 2026-04-15

### Changed

- Redesigned the component view and added snippet-based preview code.

## [0.0.18] - 2026-02-27

### Changed

- Scoped the explorer's CSS under `.sdocs-app` to keep its styles from leaking
  into component previews.

## [0.0.17] - 2026-02-27

### Fixed

- Corrected the `Icon` component imports.

## [0.0.16] - 2026-02-27

### Added

- Rewritten codebase: the current architecture for `.sdoc` discovery, preview
  rendering, and the component explorer UI.
