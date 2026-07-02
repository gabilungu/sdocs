# Design note: full language support for `.sdoc` (future)

Status: **proposed / not started.** Captures the plan discussed while shipping
`.sdoc` formatting in the VS Code extension (v0.0.13).

## Goal

Give `.sdoc` files the rich editing features they currently lack — **completion,
hover, type diagnostics, go-to-definition, rename** — with *correct* results (no
spurious errors), while keeping the `.sdoc` identity (custom language id, icons,
`meta` autocomplete, page/layout variants).

## What works today (v0.0.13) and why

`.sdoc` is **syntactically valid Svelte 5** (`<script>` + top-level `{#snippet}`
blocks + an `export const meta`). That compatibility is what makes the cheap
features possible:

- **Highlighting** — `source.sdoc` grammar just `include`s `source.svelte`.
- **Formatting** — the extension delegates to the user's installed Svelte
  formatter by mirroring the `.sdoc` into a hidden scratch `.svelte` file and
  running `executeFormatDocumentProvider` on it. The scratch must live in the
  nearest `node_modules/.cache/sdocs-format/` so the project's **Svelte 5**
  resolves (prettier-plugin-svelte resolves the Svelte compiler relative to the
  file; outside a project it falls back to the bundled Svelte 4 and can't parse
  `{#snippet}`). See `packages/vscode/src/SdocFormatProvider.ts`.

What's missing — completion / hover / diagnostics — are **language-server**
features, and the Svelte LS only attaches to `language: svelte`. `.sdoc` has its
own language id, so the server never sees it.

## Why not the easy options

- **`files.associations: {"*.sdoc": "svelte"}`** — gives native features
  instantly, but loses the `.sdoc` identity (icons, `meta` autocomplete) and the
  Svelte type-checker flags `.sdoc`-isms (e.g. `args` is injected by the sdocs
  runtime → "Cannot find name 'args'"). Spurious errors everywhere.
- **Naively proxying each LSP request to the Svelte LS via a scratch** — module
  resolution breaks (a scratch in `node_modules/.cache` can't resolve `./Button.svelte`
  the way the real file does), so completion/hover for imported symbols is wrong.

## Proposed approach: transform + source map (the Volar model)

The same architecture Svelte (svelte2tsx), Vue (Volar), Astro, and MDX use:

1. **Transform** `.sdoc` → a *valid* `.svelte` (or `.tsx`) virtual document,
   **with a source map**. Because we control the transform, we:
   - inject a declaration for `args` (kills the spurious "args" error),
   - relocate/strip `meta` so it type-checks as intended,
   - keep `{#snippet}` as-is (already valid Svelte 5).
   The transform is nearly identity *because we kept `.sdoc` Svelte-compatible* —
   this is the payoff for **not** inventing custom syntax like `{#example}`.
2. Run the real **Svelte / TS language service** over the virtual document.
3. **Map** completions / hover / diagnostics / definitions back to `.sdoc`
   positions via the source map.

Build it on **Volar** (`@volar/language-core`, `@volar/language-server`), which
is purpose-built for embedded/meta languages over TS. Ship it as a language
server in `packages/vscode` with an LSP client in `extension.ts`.

### Strong recommendation: do NOT diverge from Svelte syntax

Renaming `{#snippet}` → `{#example}` (or any custom construct) throws away *every*
free thing above — Svelte grammar highlighting, the delegated formatter, the
Svelte compiler in the sdocs build pipeline, and the near-identity transform.
You'd own a grammar, parser, formatter, and LS from scratch. The readability gain
is marginal; the cost is enormous. Keep `{#snippet}`.

## Phasing

1. **Spike**: stand up a minimal Volar language plugin; prove hover works on an
   in-file symbol with correct position mapping.
2. **Completion** (in-file symbols, then imported component props).
3. **Diagnostics** (with `.sdoc`-isms suppressed via the transform).
4. **Definition / rename / references.**

## Risks / open questions

- Keeping the transform in step with Svelte language changes (mitigated by
  staying Svelte-compatible).
- Performance of virtual-doc + source-map on large `.sdoc` trees.
- Exact shape of the transform for `meta` and `args` — needs prototyping.
- Whether to reuse svelte2tsx output or transform straight to a `.svelte` virtual
  file and lean on the Svelte LS.
