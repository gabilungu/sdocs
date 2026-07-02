# Changelog

All notable changes to the `sdocs` package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
