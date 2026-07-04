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
  TocHeading,
} from 'sdocs';
```

Fields that can be absent are typed as required-but-nullable (`string | null`),
not TypeScript-optional — check for `null`, not for the key's presence.

## `SdocsConfig`

User-facing config type. All fields optional.

```ts
interface SdocsConfig {
  include?: string | string[];
  port?: number;
  open?: boolean;
  css?: string | Record<string, string>;
  logo?: string;
  icon?: string | false;
  sidebar?: {
    order?: Record<string, string[]>;
    open?: string[];
  };
}
```

See the [configuration reference](/explorer/configuration) for field semantics.

## `ResolvedSdocsConfig`

Same as `SdocsConfig` but with all defaults applied — every field is required.

```ts
interface ResolvedSdocsConfig {
  include: string[];
  port: number;
  open: boolean;
  css: string | Record<string, string> | null;
  logo: string;
  icon: string | false;
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
  kind: 'component' | 'page' | 'layout';
  filePath: string;                     // absolute path to the .sdoc file
  componentPath: string | null;         // absolute path to the documented component
  meta: SdocMeta;
  componentData: ComponentData | null;  // for kind === 'component'
  snippets: ExtractedSnippet[];         // Default + named
  highlightedSource: string | null;     // highlighted component source HTML
  toc?: TocHeading[];                   // for kind === 'page'
}

interface TocHeading {
  text: string;
  level: number;
  id: string;
}
```

## `ComponentData`

The extracted public API of a Svelte component.

```ts
interface ComponentData {
  props: ParsedProp[];
  methods: ParsedMethod[];
  state: ParsedState[];
  cssProps: ParsedCssProp[];
}
```

Events and snippets are not separate arrays — they live in `props`, tagged by
`ParsedProp.category`, and are split out at render time.

## `ParsedProp`

```ts
interface ParsedProp {
  name: string;
  type: string | null;
  default: string | null;
  description: string | null;
  required: boolean;
  category: 'prop' | 'event' | 'snippet';
}
```

## `ParsedMethod`

```ts
interface ParsedMethod {
  name: string;
  params: string;              // parameter list source
  returnType: string | null;
  description: string | null;
}
```

## `ParsedState`

```ts
interface ParsedState {
  name: string;
  type: string | null;
  description: string | null;
}
```

## `ParsedCssProp`

```ts
interface ParsedCssProp {
  name: string;             // e.g. "--bg"
  type: string | null;      // from @cssvar, e.g. "color" or "dimension"
  default: string | null;
  description: string | null;
}
```

## `ExtractedSnippet`

```ts
interface ExtractedSnippet {
  name: string;             // "Default" or a named snippet
  body: string;             // snippet body source (signature stripped)
  highlightedHtml?: string; // highlighted body HTML
  previewUrl?: string;      // preview iframe URL (added by the virtual module)
}
```

## See also

- [Prop extraction](/explorer/features/prop-extraction) — what gets populated into these types
- [Embedded usage](/explorer/embedded-vite) — consuming `virtual:sdocs`
