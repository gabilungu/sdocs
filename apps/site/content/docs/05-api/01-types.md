---
title: Types
---

Public TypeScript types exported from `sdocs`.

```ts
import type {
  SdocsConfig,
  ResolvedSdocsConfig,
  DocEntry,
  SdocMeta,
  ComponentData,
  ParsedProp,
  ParsedMethod,
  ParsedState,
  ParsedCssProp,
  ExtractedSnippet,
} from 'sdocs';
```

## `SdocsConfig`

User-facing config type. All fields optional.

```ts
interface SdocsConfig {
  include?: string | string[];
  port?: number;
  open?: boolean;
  css?: string | Record<string, string>;
  logo?: string;
  sidebar?: {
    order?: Record<string, string[]>;
    open?: string[];
  };
}
```

See the [configuration reference](/docs/usage/configuration) for field semantics.

## `ResolvedSdocsConfig`

Same as `SdocsConfig` but with all defaults applied — every field is required.

```ts
interface ResolvedSdocsConfig {
  include: string[];
  port: number;
  open: boolean;
  css: string | Record<string, string> | null;
  logo: string;
  sidebar: {
    order: Record<string, string[]>;
    open: string[];
  };
}
```

Returned internally after loading the config file.

## `SdocMeta`

The shape of the `meta` object exported from a `.sdoc` file.

```ts
interface SdocMeta {
  component?: unknown;
  title: string;
  description?: string;
  args?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}
```

Only `title` is required. For component docs, `component` is also effectively required (needed for prop extraction and controls).

## `DocEntry`

Each discovered `.sdoc` file becomes one `DocEntry`. These are what `virtual:sdocs` exports as `docs`.

```ts
interface DocEntry {
  id: string;                      // unique ID (usually the file path hash)
  kind: 'component' | 'page' | 'layout';
  path: string;                    // absolute source file path
  meta: SdocMeta;
  component?: ComponentData;       // for kind === 'component'
  snippets: ExtractedSnippet[];    // Default + named
  toc?: { id: string; text: string; level: number }[]; // for kind === 'page'
}
```

## `ComponentData`

The extracted public API of a Svelte component.

```ts
interface ComponentData {
  name: string;
  props: ParsedProp[];
  events: ParsedProp[];
  snippets: ParsedProp[];
  methods: ParsedMethod[];
  state: ParsedState[];
  cssProps: ParsedCssProp[];
}
```

## `ParsedProp`

```ts
interface ParsedProp {
  name: string;
  type?: string;
  default?: string;
  description?: string;
  optional?: boolean;
}
```

Used for props, events, and snippets.

## `ParsedMethod`

```ts
interface ParsedMethod {
  name: string;
  signature?: string;
  description?: string;
}
```

## `ParsedState`

```ts
interface ParsedState {
  name: string;
  type?: string;
  kind: 'state' | 'derived';
  description?: string;
}
```

## `ParsedCssProp`

```ts
interface ParsedCssProp {
  name: string;           // e.g. "--bg"
  type?: string;          // from @cssvar, e.g. "color" or "dimension"
  default?: string;
  description?: string;
}
```

## `ExtractedSnippet`

```ts
interface ExtractedSnippet {
  name: string;      // "Default" or a named snippet
  body: string;      // snippet source
  params?: string;   // parameter list, e.g. "(args)"
}
```

## See also

- [Prop extraction](/docs/features/prop-extraction) — what gets populated into these types
- [Embedded usage](/docs/usage/embedded-vite) — consuming `virtual:sdocs`
