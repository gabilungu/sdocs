---
title: Theming
---

sdocs has two independent theming systems:

1. **App theme** (light/dark) — controls the sdocs UI itself
2. **Preview stylesheets** — CSS loaded into the component preview iframe

## App theme (light/dark)

The sdocs UI has a light/dark toggle in the sidebar header. The choice is persisted to `localStorage` under `sdocs-theme` and applied by setting `data-sdocs-theme="light"` or `"dark"` on the app's own root element (the `.sdocs-app` container, not `<html>`).

If you're styling the app shell, target these attributes:

```css
[data-sdocs-theme="light"] { /* … */ }
[data-sdocs-theme="dark"]  { /* … */ }
```

## Preview stylesheets

Stylesheets loaded into the preview iframe are controlled by the `css` option in `sdocs.config.js`.

### Single stylesheet

```js
css: './src/styles/global.css'
```

One stylesheet, always loaded.

### Named stylesheets

```js
css: {
  light: './src/styles/light.css',
  dark: './src/styles/dark.css',
  highContrast: './src/styles/high-contrast.css',
}
```

With more than one named stylesheet, sdocs shows a dropdown in the sidebar letting users switch between them. Only one is active at a time — switching disables the others.

This is useful for:

- Light/dark variants of your design system
- Brand variants (Acme vs. AcmeKids)
- Accessibility variants (high contrast)

### App theme vs. preview theme

These are **separate** — the sdocs UI being in dark mode doesn't automatically switch the preview to a dark stylesheet. Users control each independently.

If you want them to track each other, name your stylesheets `light` and `dark` — the sdocs app theme names match, so mentally they'll line up even though the switching is manual.

### Path resolution

- Relative paths (`./styles/…`) — resolved against the project root
- Absolute paths (`/styles/…`) — used as-is
- HTTP(S) URLs — passed through unchanged

## See also

- [Configuration reference](/explorer/configuration)
- [Sidebar](/explorer/features/sidebar) — where the theme toggle and stylesheet picker live
