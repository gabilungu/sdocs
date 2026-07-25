/**
 * The `sdocs://visual-testing-guide` resource: how to look at one component
 * without photographing an entire application.
 *
 * Kept as prose rather than data on purpose — the advice is identical for
 * every stage, so repeating it inside each resolve_visual_target result would
 * spend tokens to say the same thing N times, which is the exact cost this
 * guidance exists to avoid.
 */
export const VISUAL_TESTING_GUIDE = `# Inspecting sdocs previews with a browser

sdocs renders every stage — each \`[component]\` preview, each \`[example]\`, each
\`[LAYOUT]\` — as its own standalone page. Open that page and you photograph one
component. Open the Explorer instead and you photograph a documentation app that
happens to contain it.

The difference is not small. Measured on a real 42x36px component:

| What you capture | Pixels | Image tokens |
|---|---|---|
| The Explorer page | 1934x1162 | ~1970 |
| The stage only | 1934x64 | ~108 |
| The component | 42x36 | ~2 |

## The ladder

Work down it and stop at the first rung that answers the question.

1. **Read, don't photograph.** \`getComputedStyle\` reports padding, color, font
   size, and border radius exactly; a screenshot only lets you guess at them.
   Most "is the spacing wrong?" questions are answered here, for free.
2. **Screenshot one element** when you need to see it — the button, not the page.
3. **Screenshot the stage** (\`#sdocs-preview\`) when the relationship *between*
   elements is the point, or when the component paints outside its own box.
4. **Screenshot the Explorer** only when the documentation UI itself is the bug.
5. **Full-page screenshots** only when explicitly asked for.

Before any of it, run \`check_docs\`. A stage that fails to compile renders an
error panel, and no amount of looking at that picture will explain the bug.

## The procedure

\`\`\`js
// 1. Resolve the stage. Names, routes, and stage ids all work; you never
//    reproduce the slug rules yourself.
const target = await mcp.resolve_visual_target({ target: 'Button / Sizes' });

// 2. Open the preview-only route. previewRoute is relative — join it to
//    whatever origin the dev server actually reported (the port is not fixed).
await page.goto(origin + target.resolved.previewRoute);

// 3. Wait for the marker. It is set after mount, after webfonts settle, and
//    after images decode — screenshotting earlier catches a half-drawn stage.
await page.locator(target.resolved.readySelector).waitFor();

// 4. Locate the smallest relevant element and measure it.
const button = page.getByRole('button', { name: 'Small' });
const box = await button.boundingBox();   // runtime truth; nothing predicts this

// 5. Capture it.
await button.screenshot({ path: 'small-button.png', scale: 'css' });
\`\`\`

Runtime size is never reported by the MCP server, because it can't be: it
depends on the viewport, responsive CSS, loaded fonts, and the component's own
content. \`boundingBox()\` owns that answer, and a locator screenshot crops to it
automatically.

## Shadows, glows, and focus rings

\`boundingBox()\` returns the **border box**. A component's visible extent is
often larger — \`box-shadow\`, \`filter: drop-shadow\`, an \`outline\` with an offset,
a focus ring. Cropping to the border box cuts exactly the pixels a design review
is looking at.

Two ways to keep the halo:

**Capture the stage.** \`stageLayout.padding\` from \`resolve_visual_target\` is the
author's own answer to "how much room does this need?". A stage with padding
already holds the shadow, so \`#sdocs-preview\` is a safe target.

**Or grow the crop.** Every stage page exposes a helper that measures how far an
element actually paints, read from computed styles rather than assumed:

\`\`\`js
const rect = await page.evaluate(() =>
  window.__sdocs.captureRect('.my-button', { padding: 8 })
);
// { x, y, width, height, clipped, bleeds }
await page.screenshot({ clip: rect, scale: 'css' });
\`\`\`

- \`bleeds: true\` — the component paints outside its box; a tight element
  screenshot would have clipped it.
- \`clipped: true\` — the halo runs past the edge of the viewport, so the crop is
  cut short. Widen the viewport, or give the stage more \`padding\`, before
  trusting the image.

\`window.__sdocs.inkBleed(selector)\` returns the per-side overflow on its own
(\`{ left, right, top, bottom }\`) when you want the numbers rather than a picture.

## What a stage page gives you

| Thing | Where |
|---|---|
| Ready marker | \`<html data-sdocs-stage-ready>\` |
| Failed stage | \`<html data-sdocs-stage-error="render \\| script \\| timeout">\` |
| Stage identity | \`window.__sdocs.stage\` → \`{ id, kind, name, component }\` |
| Capture rect | \`window.__sdocs.captureRect(selector?, { padding })\` |
| Ink overflow | \`window.__sdocs.inkBleed(selector?)\` |
| The stage element | \`#sdocs-preview\` |

A stage always ends up marked ready, even when it fails — a client waiting on
the marker gets an answer instead of a timeout. Check \`data-sdocs-stage-error\`
before trusting what you see.

## Variants

\`?theme=dark\` sets \`data-sdocs-theme\` on the stage document, for CSS keyed off
that attribute. Themes driven by \`prefers-color-scheme\` are the browser's to
emulate (\`page.emulateMedia({ colorScheme: 'dark' })\`) — sdocs does not fake the
media query. \`?css=<name>\` picks between the stylesheets a project configures
under \`css\`, which is how sdocs models real theme variants.

## Editing

The dev server hot-reloads a stage page in place. Resolve once, open once, then
edit the component and re-measure — no re-navigation, no re-resolution.
\`resolve_visual_target\` reports \`source.component\` (the \`.svelte\` file) and
\`source.doc\` with a line, so what you see leads straight to what you edit.
`;
