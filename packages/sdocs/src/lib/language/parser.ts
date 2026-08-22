/**
 * Semantic layer over the syntactic scanner: validates attributes against
 * the sdoc language rules and produces typed entities ready for the Vite
 * plugin, the CLI app-gen, and the editor tooling.
 */

import {
	scanSdoc,
	type Attrs,
	type AttrValue,
	type Entity,
	type ScanError,
	type SdocFile,
	type Span,
	subBlockKindOf,
	type SubBlock,
	type TagBlock,
} from './scanner.js';
import { declaredBindings, scrubScriptText } from './script-scan.js';
import type {
	ComponentStatus,
	DocNote,
	GlossaryBlock,
	GlossaryTerm,
	NoteType,
	TodoItem,
} from '../types.js';
import { NOTE_TYPES } from '../note-order.js';

import { slugifySegment } from '../slug.js';

export type { TodoItem };

export type ArgValue = string | number | boolean | null;

/** Explicit presentation overrides from stage attributes */
export interface Sizing {
	maxWidth: string | null;
	padding: string | null;
	/** flex-direction of preview/example stages */
	direction: string | null;
	/** gap of preview/example stages */
	gap: string | null;
	/** horizontal alignment of preview/example stage contents */
	contentX: string | null;
	/** vertical alignment of preview/example stage contents */
	contentY: string | null;
	/** background of preview/example stages — a CSS color or var() */
	background: string | null;
	/** minimum height of preview/example stages — a CSS length; reserves room
	 * for content that overflows the stage, like an open dropdown */
	minHeight: string | null;
	/** table-of-contents visibility (DOC) */
	toc: boolean | null;
}

export interface PreviewBlock {
	/** The identifier from component={X}; null when invalid/missing (already reported) */
	componentName: string | null;
	/** Parsed args literal; null when absent or invalid */
	args: Record<string, ArgValue> | null;
	/** Exact source of the args expression (inner object), for code display */
	argsRaw: string | null;
	/** Explicit title="…" override, when present */
	title: string | null;
	/** Short text rendered with the preview, when present */
	description: string | null;
	/** Other names this component answers to, from synonyms="…". Shown with
	 * the preview and searched by the MCP server; empty when absent. */
	synonyms: string[];
	/** Where this component sits in its life, from status="…"; null when the
	 * author did not say. */
	status: ComponentStatus | null;
	/** Tab label: the title override or the component name */
	label: string;
	sizing: Sizing;
	/** Normalized full body — block script/style included (display/formatting form) */
	body: string;
	bodySpan: Span;
	/** Block-level <script>, when the body opens with one */
	script: TagBlock | null;
	/** Block-level <style>, when the body ends with one */
	style: TagBlock | null;
	/** Normalized markup between the block script and style */
	markup: string;
	span: Span;
}

export interface ExampleBlock {
	title: string;
	/** Short text rendered under the example heading, when present */
	description: string | null;
	/** What this example shows, from tags="…" — the parts or contexts it
	 * belongs to. Shown under the description and searched by the MCP
	 * server; empty when absent. */
	tags: string[];
	/** Standing remarks from a nested [NOTES] block; empty when there is none */
	notes: DocNote[];
	/** The checklist from a nested [TODO] block; empty when there is none */
	todos: TodoItem[];
	/** Markdown from a nested [PROSE] block, rendered under the title */
	prose: string | null;
	/** `code="false"` hides this example's code panel; true by default. */
	showCode: boolean;
	sizing: Sizing;
	/** Normalized full body — block script/style included (display/formatting form) */
	body: string;
	bodySpan: Span;
	/** Block-level <script>, when the body opens with one */
	script: TagBlock | null;
	/** Block-level <style>, when the body ends with one */
	style: TagBlock | null;
	/** Normalized markup between the block script and style */
	markup: string;
	span: Span;
}

/** One `- [ ] text` line of a `[TODO]` block, with whatever nests under it. */
/**
 * One item in a [SHOWCASE]'s body, in source order.
 *
 * `[COMPONENT]` blocks are tabs rather than flow: several of them share one
 * stage, one set of code panels and one API table, so the whole tab strip is a
 * single item here — which is what lets prose sit before or after it and mean
 * something. `index` points into the entity's own `previews`/`examples`/
 * `prose` arrays.
 */
export type FlowItem =
	| { kind: 'components'; indices: number[] }
	| { kind: 'example'; index: number }
	| { kind: 'prose'; index: number }
	| { kind: 'glossary'; index: number };

export interface ShowcaseEntity {
	kind: 'SHOWCASE';
	title: string;
	slug: string;
	/** Explicit route leaf from slug="…"; null → slugified title segment */
	routeSlug: string | null;
	/** `hide` flag: routable but never listed in a sidebar */
	hide: boolean;
	/** Standing remarks from a [NOTES] block; empty when there is none */
	notes: DocNote[];
	/** The checklist from a [TODO] block; empty when there is none */
	todos: TodoItem[];
	/** Markdown from [PROSE] blocks, in source order; empty when there are none */
	prose: string[];
	/** What the entity shows, in the order it was written. */
	flow: FlowItem[];
	/** [GLOSSARY] blocks, in source order. */
	glossaries: GlossaryBlock[];
	description: string | null;
	sizing: Sizing;
	/** Entity-level <script> — shared by every block of this entity */
	script: TagBlock | null;
	/** Entity-level <style> — joins the stage css of this entity's blocks */
	style: TagBlock | null;
	previews: PreviewBlock[];
	examples: ExampleBlock[];
	openerSpan: Span;
	span: Span;
}

export interface DocEntity {
	kind: 'DOC';
	title: string;
	slug: string;
	/** Explicit route leaf from slug="…"; null → slugified title segment */
	routeSlug: string | null;
	/** `hide` flag: routable but never listed in a sidebar */
	hide: boolean;
	/** Standing remarks from a [NOTES] block; empty when there is none */
	notes: DocNote[];
	/** The checklist from a [TODO] block; empty when there is none */
	todos: TodoItem[];
	/** Markdown from [PROSE] blocks, in source order; empty when there are none */
	prose: string[];
	/** [GLOSSARY] blocks, in source order — spliced into the body where they
	 * were written, the way examples are. */
	glossaries: GlossaryBlock[];
	sizing: Sizing;
	/** Entity-level <script> — shared by every block of this entity */
	script: TagBlock | null;
	/** Entity-level <style> — joins the stage css of this entity's blocks */
	style: TagBlock | null;
	/** Prose body with each [example] block replaced by a
	 * `{@render __sdocsExample?.(i)}` marker the doc renderer resolves. */
	body: string;
	/** The doc's [example] blocks, in marker order */
	examples: ExampleBlock[];
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

/** A Svelte-built page in the docs app's own context: the body is plain
 * Svelte (no markdown), rendered as a real page without stage tooling. */
export interface PageEntity {
	kind: 'PAGE';
	title: string;
	slug: string;
	/** Explicit route leaf from slug="…"; null → slugified title segment */
	routeSlug: string | null;
	/** `hide` flag: routable but never listed in a sidebar */
	hide: boolean;
	/** Standing remarks from a [NOTES] block; empty when there is none */
	notes: DocNote[];
	/** The checklist from a [TODO] block; empty when there is none */
	todos: TodoItem[];
	/** Markdown from [PROSE] blocks, in source order; empty when there are none */
	prose: string[];
	sizing: Sizing;
	/** Entity-level <script> — shared by every block of this entity */
	script: TagBlock | null;
	/** Entity-level <style> — joins the stage css of this entity's blocks */
	style: TagBlock | null;
	body: string;
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

export interface LayoutEntity {
	kind: 'LAYOUT';
	title: string;
	slug: string;
	/** Explicit route leaf from slug="…"; null → slugified title segment */
	routeSlug: string | null;
	/** `hide` flag: routable but never listed in a sidebar */
	hide: boolean;
	/** Standing remarks from a [NOTES] block; empty when there is none */
	notes: DocNote[];
	/** The checklist from a [TODO] block; empty when there is none */
	todos: TodoItem[];
	/** Markdown from [PROSE] blocks, in source order; empty when there are none */
	prose: string[];
	sizing: Sizing;
	/** Entity-level <script> — shared by every block of this entity */
	script: TagBlock | null;
	/** Entity-level <style> — joins the stage css of this entity's blocks */
	style: TagBlock | null;
	body: string;
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

/**
 * A composition documented as one thing: a user menu, a notifications system.
 *
 * Structurally a [SHOWCASE] with the prop half switched off — the same blocks,
 * the same flow, the same stages — but no [COMPONENT], because a composition
 * has no single component whose API it could document. `previews` is always
 * empty; it is kept so the two kinds share every code path that reads them.
 */
export interface PatternEntity extends Omit<ShowcaseEntity, 'kind'> {
	kind: 'PATTERNS';
}

export type SdocEntity = ShowcaseEntity | DocEntity | PageEntity | LayoutEntity | PatternEntity;

export interface SdocDocument {
	script: TagBlock | null;
	style: TagBlock | null;
	entities: SdocEntity[];
	diagnostics: ScanError[];
	source: string;
}

/**
 * Normalize a raw block body for consumption: strip the common leading
 * indentation (bodies sit one level deep inside their block), drop a
 * trailing carriage return per line, and unescape lines that start with
 * `\[` (the escape for body lines that would otherwise read as tags).
 * The scanner keeps the raw text and spans; this is the display/runtime form.
 */
export function normalizeBody(raw: string): string {
	const lines = raw.split('\n').map((line) => line.replace(/\r$/, ''));
	let common: string | null = null;
	for (const line of lines) {
		if (line.trim() === '') continue;
		const indent = line.match(/^[ \t]*/)![0];
		if (common === null) {
			common = indent;
		} else {
			let k = 0;
			while (k < common.length && k < indent.length && common[k] === indent[k]) k++;
			common = common.slice(0, k);
		}
	}
	const cut = common?.length ?? 0;
	return lines
		.map((line) => (line.trim() === '' ? '' : line.slice(cut)))
		// Unescape `\[` after any leading whitespace (deeper-indented lines
		// keep their relative indent after the common cut), preserving it.
		.map((line) => line.replace(/^([ \t]*)\\(?=\[)/, '$1'))
		.join('\n')
		.replace(/^\n+|\n+$/g, '');
}

/**
 * Slug used for entity addressing: relPath + '#' + slug.
 *
 * The same rule the routes use. It was ASCII-only, which meant every title in
 * a script without one — Cyrillic, CJK, Arabic — collapsed to 'untitled', and
 * a second such entity in the file was a duplicate-address error. The routes
 * had already been taught to keep those letters; this had not.
 */
export function slugifyTitle(title: string): string {
	return slugifySegment(title, 'untitled');
}

/** URL-safe slug for an example snippet. The 'x-' prefix keeps example slugs
 * clear of 'content' and of most preview slugs — a preview label can still
 * produce the same slug ("X Ray" → x-ray vs example "Ray" → x-ray), which
 * gets a diagnostic here and a deterministic numeric suffix in the planner. */
export function exampleSlug(title: string): string {
	return 'x-' + slugifyTitle(title);
}

/** URL-safe slug for a preview snippet (from its tab label). */
export function previewSlug(label: string): string {
	return slugifyTitle(label);
}

// A component reference: a PascalCase identifier, optionally with member
// access into a compound (`NavTree.Group`, `Grid.Cell`).
const IDENTIFIER_RE = /^[A-Z][A-Za-z0-9_]*(\.[A-Z][A-Za-z0-9_]*)*$/;

const IMPORT_RE = /import\s+(?:type\s+)?([^'"]+?)\s+from\s*['"][^'"]+['"]/g;

/** The local identifiers an import statement list binds — default, namespace,
 * and named (respecting `as` aliases). Offsets are relative to `script`. */
export function importedNames(script: string): Map<string, Span> {
	const names = new Map<string, Span>();
	// Blank out comments and string/template contents (offset-preserving) so
	// commented-out imports and import-shaped code samples never match.
	const scrubbed = scrubScriptText(script);
	for (const match of scrubbed.matchAll(IMPORT_RE)) {
		const clause = match[1];
		const span: Span = { start: match.index!, end: match.index! + match[0].length };
		const braces = clause.match(/\{([^}]*)\}/);
		if (braces) {
			for (const entry of braces[1].split(',')) {
				const name = entry.replace(/^\s*type\s+/, '').trim();
				if (!name) continue;
				const local = name.includes(' as ') ? name.split(' as ').pop()!.trim() : name;
				if (local) names.set(local, span);
			}
		}
		const rest = clause.replace(/\{[^}]*\}/, '');
		const ns = rest.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
		if (ns) names.set(ns[1], span);
		const def = rest.replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '').match(/[A-Za-z_$][\w$]*/);
		if (def) names.set(def[0], span);
	}
	return names;
}

/** A nested script may not re-import an identifier an outer scope already
 * binds — the generated module concatenates the scripts, so the duplicate
 * would be a confusing compile error. Reported here as a clear diagnostic
 * instead. Also flags redefinitions of stage-provided names. */
/** Outer imports plus the entity script's — the scope a block script sees. */
function mergeImports(outer: Map<string, Span>, script: TagBlock | null): Map<string, Span> {
	if (!script) return outer;
	const merged = new Map(outer);
	for (const [name, span] of importedNames(script.content)) merged.set(name, span);
	return merged;
}

/** Which generated wrappers a script's content is lifted into, and therefore
 * which plumbing names it must not redeclare:
 * - stage: the iframe wrapper (declares `args` and `__sdocsRef`) — previews,
 *   examples, SHOWCASE/LAYOUT entity scripts, DOC entity scripts (their
 *   examples), and the file script.
 * - page: the DOC/PAGE page component (declares `__sdocsExample` via
 *   `$props()`) — DOC and PAGE entity scripts, and the file script. */
interface ScriptTargets {
	stage: boolean;
	page: boolean;
}

const STAGE_ONLY: ScriptTargets = { stage: true, page: false };

function checkReservedNames(
	script: TagBlock,
	targets: ScriptTargets,
	diagnostics: ScanError[],
): void {
	const reserved = new Map<string, string>();
	if (targets.stage) {
		for (const name of ['args', '__sdocsRef']) {
			reserved.set(name, `"${name}" is provided by the preview stage — pick another name.`);
		}
	}
	if (targets.page) {
		reserved.set(
			'__sdocsExample',
			'"__sdocsExample" is provided by the page wrapper — pick another name.',
		);
	}
	const at = (start: number, end: number): Span => ({
		start: script.contentSpan.start + start,
		end: script.contentSpan.start + end,
	});
	const seen = new Set<string>();
	// Declarations — const/let/var/function/class, including destructured
	// bindings ({ args }, [args], { x: args }, { ...args }) — collide with the
	// wrapper's own declarations at compile time.
	for (const binding of declaredBindings(script.content)) {
		const message = reserved.get(binding.name);
		if (!message || seen.has(binding.name)) continue;
		seen.add(binding.name);
		diagnostics.push({ code: 'reserved-name', message, span: at(binding.start, binding.end) });
	}
	// An import binding a reserved name collides the same way.
	for (const [name, span] of importedNames(script.content)) {
		const message = reserved.get(name);
		if (!message || seen.has(name)) continue;
		seen.add(name);
		diagnostics.push({ code: 'reserved-name', message, span: at(span.start, span.end) });
	}
	// The page wrapper's `let { __sdocsExample } = $props()` is the one
	// allowed $props() call in the generated component.
	if (targets.page) {
		const m = scrubScriptText(script.content).match(/\$props\s*\(/);
		if (m && m.index !== undefined) {
			diagnostics.push({
				code: 'reserved-name',
				message: 'The page wrapper already uses $props() — this script cannot call it.',
				span: at(m.index, m.index + '$props'.length),
			});
		}
	}
}

function checkNestedScript(
	script: TagBlock | null,
	outerImports: Map<string, Span>,
	diagnostics: ScanError[],
	targets: ScriptTargets = STAGE_ONLY,
): void {
	if (!script) return;
	// The generated wrappers declare plumbing names; a script redefining one
	// would collide at compile time. PAGE bodies render through the plain page
	// component only, so `args`/`__sdocsRef` stay free there (stage: false).
	checkReservedNames(script, targets, diagnostics);
	if (outerImports.size === 0) return;
	for (const [name, span] of importedNames(script.content)) {
		if (outerImports.has(name)) {
			diagnostics.push({
				code: 'duplicate-import',
				message: `"${name}" is already imported by an outer <script> — it is in scope here; remove this import.`,
				span: {
					start: script.contentSpan.start + span.start,
					end: script.contentSpan.start + span.end,
				},
			});
		}
	}
}

export interface AttrRule {
	/** required | optional */
	required: boolean;
	/** expected value kind ('bare' = a lone flag, no value) */
	kind: 'string' | 'expression' | 'bare';
	hint: string;
	/** Diagnostic code when the attribute is missing or its value has the
	 * wrong kind (defaults: 'missing-attr' / 'attr-value-kind'). A dedicated
	 * code lets the build treat an unusable attribute as an error. */
	code?: string;
}

const SIZING_ATTR_RULES: Record<string, AttrRule> = {
	maxWidth: { required: false, kind: 'string', hint: 'maxWidth="1200px"' },
	padding: { required: false, kind: 'string', hint: 'padding="32px"' },
};

const STAGE_LAYOUT_ATTR_RULES: Record<string, AttrRule> = {
	direction: { required: false, kind: 'string', hint: 'direction="column"' },
	gap: { required: false, kind: 'string', hint: 'gap="16px"' },
	contentX: { required: false, kind: 'string', hint: 'contentX="center"' },
	contentY: { required: false, kind: 'string', hint: 'contentY="middle"' },
	background: { required: false, kind: 'string', hint: 'background="var(--bg)"' },
	minHeight: { required: false, kind: 'string', hint: 'minHeight="240px"' },
};

function sizingOf(attrs: Attrs): Sizing {
	const toc = stringAttr(attrs, 'toc');
	return {
		maxWidth: stringAttr(attrs, 'maxWidth'),
		padding: stringAttr(attrs, 'padding'),
		direction: stringAttr(attrs, 'direction'),
		gap: stringAttr(attrs, 'gap'),
		contentX: stringAttr(attrs, 'contentX'),
		contentY: stringAttr(attrs, 'contentY'),
		background: stringAttr(attrs, 'background'),
		minHeight: stringAttr(attrs, 'minHeight'),
		toc: toc === null ? null : toc === 'true',
	};
}

const ROUTE_ATTR_RULES: Record<string, AttrRule> = {
	slug: { required: false, kind: 'string', hint: 'slug="url-segment"' },
	hide: { required: false, kind: 'bare', hint: 'hide' },
};

const ENTITY_ATTR_RULES: Record<string, Record<string, AttrRule>> = {
	SHOWCASE: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		description: { required: false, kind: 'string', hint: 'description="…"' },
		...ROUTE_ATTR_RULES,
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
	DOC: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		...ROUTE_ATTR_RULES,
		...SIZING_ATTR_RULES,
		// On DOC, contentX aligns the content column (with its toc), not a stage.
		contentX: { required: false, kind: 'string', hint: 'contentX="center"' },
		toc: { required: false, kind: 'string', hint: 'toc="false"' },
	},
	PAGE: {
		title: { required: true, kind: 'string', hint: 'title="Name"' },
		...ROUTE_ATTR_RULES,
		...SIZING_ATTR_RULES,
		// On PAGE, contentX places the content container inside the view.
		contentX: { required: false, kind: 'string', hint: 'contentX="center"' },
	},
	PATTERNS: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		description: { required: false, kind: 'string', hint: 'description="…"' },
		...ROUTE_ATTR_RULES,
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
	LAYOUT: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		...ROUTE_ATTR_RULES,
		...SIZING_ATTR_RULES,
		// The page-canvas subset of the stage attributes: paint and size the
		// full-bleed stage without a wrapper element. (The flex attributes stay
		// SHOWCASE-only — a LAYOUT body is flow-root, not a flex stage.)
		background: { required: false, kind: 'string', hint: 'background="var(--bg)"' },
		minHeight: { required: false, kind: 'string', hint: 'minHeight="100vh"' },
	},
};

const SUB_BLOCK_ATTR_RULES: Record<string, Record<string, AttrRule>> = {
	preview: {
		component: { required: true, kind: 'expression', hint: 'component={Button}' },
		args: { required: false, kind: 'expression', hint: 'args={{ label: "Hi" }}' },
		title: { required: false, kind: 'string', hint: 'title="…"' },
		description: { required: false, kind: 'string', hint: 'description="…"' },
		synonyms: { required: false, kind: 'string', hint: 'synonyms="pill, chip"' },
		status: { required: false, kind: 'string', hint: 'status="ready"' },
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
	glossary: {
		title: { required: false, kind: 'string', hint: 'title="Terms"' },
		subtitle: { required: false, kind: 'string', hint: 'subtitle="…"' },
		search: { required: false, kind: 'bare', hint: 'search' },
	},
	example: {
		title: { required: true, kind: 'string', hint: 'title="…"', code: 'example-title-required' },
		description: { required: false, kind: 'string', hint: 'description="…"' },
		tags: { required: false, kind: 'string', hint: 'tags="user menu, badge"' },
		code: { required: false, kind: 'string', hint: 'code="false"' },
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
};

/** Allowed attributes and their value shapes for a block, keyed by kind
 * ('SHOWCASE'|'DOC'|'PAGE'|'LAYOUT'|'preview'|'example'). Single source of
 * truth for both diagnostics and editor attribute completions.
 *
 * Entity kinds are uppercase; a sub-block tag is accepted in either casing,
 * matching the parser — a file the formatter has not reached yet is still a
 * file the editor has to help with. */
export function attributeRules(kind: string): Record<string, AttrRule> {
	if (ENTITY_ATTR_RULES[kind]) return ENTITY_ATTR_RULES[kind];
	// [COMPONENT] is the canonical tag for the preview kind.
	const key = subBlockKindOf(kind) ?? kind;
	return SUB_BLOCK_ATTR_RULES[key] ?? {};
}

function checkAttrs(
	owner: string,
	attrs: Attrs,
	rules: Record<string, AttrRule>,
	ownerSpan: Span,
	diagnostics: ScanError[],
): void {
	for (const [name, value] of Object.entries(attrs)) {
		const rule = rules[name];
		if (!rule) {
			diagnostics.push({
				code: 'unknown-attr',
				message: `Unknown attribute "${name}" on ${owner}. Allowed: ${Object.keys(rules).join(', ')}.`,
				span: value.span,
			});
			continue;
		}
		if (value.kind !== rule.kind) {
			diagnostics.push({
				// A present-but-unusable value counts as missing for rules with a
				// dedicated code (e.g. title={expr} on [example] must fail builds
				// exactly like a missing title).
				code: rule.code ?? 'attr-value-kind',
				message: `Attribute "${name}" on ${owner} must be written ${rule.hint}.`,
				span: value.span,
			});
		}
	}
	for (const [name, rule] of Object.entries(rules)) {
		if (rule.required && !attrs[name]) {
			diagnostics.push({
				code: rule.code ?? 'missing-attr',
				message: `${owner} requires ${rule.hint}.`,
				span: ownerSpan,
			});
		}
	}
}

function stringAttr(attrs: Attrs, name: string): string | null {
	const v = attrs[name];
	return v && v.kind === 'string' ? v.raw : null;
}

const NOTE_INTENTS = ['danger', 'warning', 'success', 'info'] as const;
const NOTE_KEYS = ['note', 'intent'];

/**
 * The `[NOTES]` vocabulary, **worst first** — the order the sidebar rolls a
 * subtree up by.
 *
 * Status only, deliberately. `a11y`, `perf` and the like are categories, not
 * statuses, and mixing the two makes the ranking meaningless: there is no
 * honest answer to whether an `a11y` note outranks a `bug`. Categories are
 * what `tags` already does.
 *
 * A line with no type sits between `wip` and `ready`: it says "read me"
 * without saying what about, which is more than a note whose whole content is
 * reassurance.
 */
export { NOTE_TYPES, NOTE_TYPE_ORDER } from '../note-order.js';

/** The lifecycle a `[COMPONENT]` may declare, in order. */
export const COMPONENT_STATUSES: readonly ComponentStatus[] = [
	'draft',
	'wip',
	'review',
	'experimental',
	'ready',
	'deprecated',
];

// The type allows digits, not just letters: `a11y` is one of them, and a
// letters-only pattern silently read it as an untyped note whose text began
// "a11y:" — no diagnostic, just a grey note where a red one belonged.
/** `- Term: definition`. The first colon splits; a term may not contain one. */
const GLOSSARY_LINE_RE = /^-\s+([^:]+):\s*(.*)$/;

/**
 * One `[GLOSSARY]` — its attributes, and its `- Term: definition` lines.
 *
 * A line that is not a definition is reported rather than dropped: a glossary
 * whose entries silently vanish is worse than one that refuses to build.
 */
function parseGlossary(block: SubBlock, diagnostics: ScanError[]): GlossaryBlock {
	checkAttrs('[GLOSSARY]', block.attrs, SUB_BLOCK_ATTR_RULES.glossary, block.openerSpan, diagnostics);
	const terms: GlossaryTerm[] = [];
	const seen = new Set<string>();
	for (const raw of normalizeBody(block.body).split('\n')) {
		if (raw.trim() === '') continue;
		const m = GLOSSARY_LINE_RE.exec(raw.trim());
		if (!m) {
			diagnostics.push({
				code: 'glossary-line',
				message: `Every [GLOSSARY] line is "- Term: what it means": ${raw.trim()}`,
				span: block.bodySpan,
			});
			continue;
		}
		const term = m[1].trim();
		const definition = m[2].trim();
		if (!definition) {
			diagnostics.push({
				code: 'glossary-line',
				message: `"${term}" has no definition — write "- ${term}: what it means".`,
				span: block.bodySpan,
			});
			continue;
		}
		const key = term.toLowerCase();
		if (seen.has(key)) {
			diagnostics.push({
				code: 'duplicate-term',
				message: `"${term}" is defined twice in this [GLOSSARY] — merge them.`,
				span: block.bodySpan,
			});
			continue;
		}
		seen.add(key);
		terms.push({ term, definition });
	}
	return {
		title: stringAttr(block.attrs, 'title'),
		subtitle: stringAttr(block.attrs, 'subtitle'),
		search: bareAttr(block.attrs, 'search'),
		terms,
	};
}

const NOTE_LINE_RE = /^-\s+(?:([a-z][a-z0-9]*):\s*)?(.*)$/;

/**
 * A `[NOTES]` body: one `- type: text` line per note, or `- text` for a plain
 * remark. Blank lines are skipped; anything else is reported, because a line
 * that silently rendered as nothing would look like the block had eaten it.
 */
function parseNoteLines(block: SubBlock, diagnostics: ScanError[]): DocNote[] {
	const notes: DocNote[] = [];
	for (const raw of normalizeBody(block.body).split('\n')) {
		const line = raw.trim();
		if (line === '') continue;
		const m = NOTE_LINE_RE.exec(line);
		if (!m) {
			diagnostics.push({
				code: 'note-line',
				message: `Every [NOTES] line is "- text" or "- type: text": ${line}`,
				span: block.bodySpan,
			});
			continue;
		}
		const [, rawType, text] = m;
		if (rawType && !(NOTE_TYPES as readonly string[]).includes(rawType)) {
			diagnostics.push({
				code: 'note-type',
				message: `Unknown note type "${rawType}" — expected ${NOTE_TYPES.join(', ')}.`,
				span: block.bodySpan,
			});
			continue;
		}
		if (text.trim() === '') {
			diagnostics.push({
				code: 'note-line',
				message: 'A note with no text says nothing — write one or drop the line.',
				span: block.bodySpan,
			});
			continue;
		}
		notes.push({ note: text.trim(), type: (rawType as NoteType) ?? null });
	}
	return notes;
}

const TODO_LINE_RE = /^(\s*)-\s+\[([ xX])\]\s*(.*)$/;

/**
 * A `[TODO]` body: markdown task lines, nested by indentation to any depth.
 *
 * Indentation decides parenthood, so the tree is whatever the author's
 * indentation says — no depth cap.
 */
function parseTodoItems(block: SubBlock, diagnostics: ScanError[]): TodoItem[] {
	const roots: TodoItem[] = [];
	// Each entry is the indent width that opened a level, and its item list.
	const stack: { indent: number; items: TodoItem[] }[] = [{ indent: -1, items: roots }];
	for (const raw of normalizeBody(block.body).split('\n')) {
		if (raw.trim() === '') continue;
		const m = TODO_LINE_RE.exec(raw);
		if (!m) {
			diagnostics.push({
				code: 'todo-line',
				message: `Every [TODO] line is "- [ ] text" or "- [x] text": ${raw.trim()}`,
				span: block.bodySpan,
			});
			continue;
		}
		const [, indentText, mark, text] = m;
		// Tabs and spaces both indent; a tab counts as one level like a tab does
		// everywhere else in the format.
		const indent = indentText.replace(/\t/g, ' ').length;
		while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
		const item: TodoItem = { text: text.trim(), done: mark.toLowerCase() === 'x', children: [] };
		stack[stack.length - 1].items.push(item);
		stack.push({ indent, items: item.children });
	}
	return roots;
}

/**
 * `code="false"` on an `[EXAMPLE]` — whether its code panel renders.
 *
 * Anything but `true` or `false` is reported rather than read as one of them.
 * `[DOC]`'s older `toc` takes any value and treats everything that isn't
 * `"true"` as false, which turns `toc="flase"` into a silent instruction;
 * there is no reason to add a second attribute that behaves that way.
 */
function showCodeAttr(attrs: Attrs, span: Span, diagnostics: ScanError[]): boolean {
	const raw = stringAttr(attrs, 'code');
	if (raw === null) return true;
	if (raw === 'true' || raw === 'false') return raw === 'true';
	diagnostics.push({
		code: 'example-code',
		message: `code="${raw}" in [EXAMPLE] must be "true" or "false".`,
		span: attrs['code']?.valueSpan ?? span,
	});
	return true;
}

/** A comma-separated list attribute (`tags`, `synonyms`) — the words as
 * written, minus the spacing around them. Blank entries are dropped, so a
 * trailing comma costs nothing; duplicates are dropped too, since a name
 * listed twice reads as a mistake rather than an emphasis. */
function listAttr(attrs: Attrs, name: string): string[] {
	const raw = stringAttr(attrs, name);
	if (raw === null) return [];
	const seen = new Set<string>();
	for (const part of raw.split(',')) {
		const word = part.trim();
		if (word) seen.add(word);
	}
	return [...seen];
}

/** A bare flag attribute (`hide`) is true when present. */
function bareAttr(attrs: Attrs, name: string): boolean {
	return attrs[name]?.kind === 'bare';
}

/** slug="…" must be a URL-safe segment: lowercase letters, digits, hyphens. */
function routeSlugAttr(attrs: Attrs, diagnostics: ScanError[]): string | null {
	const v = attrs['slug'];
	if (!v || v.kind !== 'string') return null;
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.raw)) {
		diagnostics.push({
			code: 'invalid-slug',
			message: `slug="${v.raw}" must be lowercase letters, digits, and hyphens (e.g. slug="my-page").`,
			span: v.span,
		});
		return null;
	}
	return v.raw;
}

/**
 * Parse a preview args expression: a flat object literal whose values are
 * plain literals (strings, numbers, booleans, null). Anything richer belongs
 * in the block body, so it is rejected here.
 */
export function parseArgsLiteral(
	raw: string,
	span: Span,
	diagnostics: ScanError[],
): Record<string, ArgValue> | null {
	const fail = (message: string): null => {
		diagnostics.push({ code: 'args-literal', message, span });
		return null;
	};
	let i = 0;
	const ws = () => {
		while (i < raw.length && /\s/.test(raw[i])) i++;
	};
	ws();
	if (raw[i] !== '{') return fail('args must be an object literal: args={{ name: value }}.');
	i++;
	const values: Record<string, ArgValue> = {};
	ws();
	while (i < raw.length && raw[i] !== '}') {
		const keyMatch = raw.slice(i).match(/^([A-Za-z_$][A-Za-z0-9_$]*|'[^']*'|"[^"]*")\s*:/);
		if (!keyMatch) return fail('args keys must be plain names, like args={{ label: "Hi" }}.');
		const key = keyMatch[1].replace(/^['"]|['"]$/g, '');
		i += keyMatch[0].length;
		ws();
		const rest = raw.slice(i);
		let m: RegExpMatchArray | null;
		if ((m = rest.match(/^'((?:[^'\\]|\\.)*)'/)) || (m = rest.match(/^"((?:[^"\\]|\\.)*)"/))) {
			values[key] = m[1].replace(/\\(.)/g, '$1');
			i += m[0].length;
		} else if ((m = rest.match(/^-?\d+(\.\d+)?/))) {
			values[key] = Number(m[0]);
			i += m[0].length;
		} else if ((m = rest.match(/^(true|false)\b/))) {
			values[key] = m[0] === 'true';
			i += m[0].length;
		} else if ((m = rest.match(/^null\b/))) {
			values[key] = null;
			i += m[0].length;
		} else {
			return fail(
				`args value for "${key}" must be a plain literal (string, number, boolean, or null); richer values go in the block body.`,
			);
		}
		ws();
		if (raw[i] === ',') {
			i++;
			ws();
		} else if (raw[i] !== '}') {
			return fail('args entries must be separated by commas.');
		}
	}
	if (raw[i] !== '}') return fail('args object literal is missing its closing "}".');
	i++;
	ws();
	if (i !== raw.length) return fail('Unexpected text after the args object literal.');
	return values;
}

function parsePreview(
	block: SubBlock,
	outerImports: Map<string, Span>,
	diagnostics: ScanError[],
): PreviewBlock {
	checkAttrs(`[${block.tag}]`, block.attrs, SUB_BLOCK_ATTR_RULES.preview, block.openerSpan, diagnostics);
	checkNestedScript(block.script, outerImports, diagnostics);

	let componentName: string | null = null;
	const component = block.attrs.component;
	if (component && component.kind === 'expression') {
		const name = component.raw.trim();
		if (IDENTIFIER_RE.test(name)) {
			componentName = name;
		} else {
			diagnostics.push({
				code: 'component-identifier',
				message:
					'component must be a component identifier imported in the file\'s <script>, like component={Button}.',
				span: component.valueSpan,
			});
		}
	}

	// An unknown status is an error rather than a silent no-status: a component
	// with no status reads as "nobody said", and a typo would look like one.
	let status: ComponentStatus | null = null;
	const statusAttr = block.attrs.status;
	if (statusAttr && statusAttr.kind === 'string') {
		const raw = statusAttr.raw.trim();
		if ((COMPONENT_STATUSES as readonly string[]).includes(raw)) {
			status = raw as ComponentStatus;
		} else {
			diagnostics.push({
				code: 'component-status',
				message: `Unknown status "${raw}" — expected ${COMPONENT_STATUSES.join(', ')}.`,
				span: statusAttr.valueSpan,
			});
		}
	}

	let args: Record<string, ArgValue> | null = null;
	let argsRaw: string | null = null;
	const argsAttr = block.attrs.args;
	if (argsAttr && argsAttr.kind === 'expression') {
		argsRaw = argsAttr.raw.trim();
		args = parseArgsLiteral(argsAttr.raw, argsAttr.valueSpan, diagnostics);
	}

	const title = stringAttr(block.attrs, 'title');
	return {
		componentName,
		args,
		argsRaw,
		title,
		description: stringAttr(block.attrs, 'description'),
		synonyms: listAttr(block.attrs, 'synonyms'),
		status,
		label: title ?? componentName ?? 'Preview',
		sizing: sizingOf(block.attrs),
		body: normalizeBody(block.body),
		bodySpan: block.bodySpan,
		script: block.script,
		style: block.style,
		markup: normalizeBody(block.markup),
		span: block.span,
	};
}

const NESTED_BLOCK_RE = /^[ \t]*\[(NOTES|TODO|PROSE)\][ \t]*$/i;

/**
 * Report a `[NOTES]`, `[TODO]`, `[PROSE]` or `[GLOSSARY]` written in a body
 * that cannot hold one.
 *
 * A `[PAGE]` or `[LAYOUT]` body is captured whole as Svelte markup, so a block
 * written there is not parsed — it just becomes text on the rendered page. It
 * produced no diagnostic until 0.0.149, which made the failure invisible: the
 * docs advertised the feature, the Explorer offered a button for it, and the
 * result was the raw block text in the middle of someone's page.
 */
function reportTextBlocksInBody(kind: string, entity: Entity, diagnostics: ScanError[]): void {
	const lines = entity.body.split('\n');
	let offset = entity.bodySpan.start;
	for (const raw of lines) {
		const m = /^[ \t]*\[(NOTES|TODO|PROSE|GLOSSARY|COMPONENT|EXAMPLE|COMPONENTS)\b/i.exec(raw);
		if (m) {
			const tag = m[1].toUpperCase();
			diagnostics.push({
				code: 'block-in-body',
				message: `[${tag}] is not read inside a [${kind}] — its body is Svelte markup, so this renders as literal text.`,
				span: { start: offset, end: offset + raw.length },
			});
		}
		offset += raw.length + 1;
	}
}

/**
 * Split an `[EXAMPLE]` body into its nested text blocks and the markup that
 * actually gets staged.
 *
 * Done here on the captured body rather than by nesting the scanner: an
 * example's body is already one string, and these blocks are line-delimited
 * with no attributes, so finding them is a line scan. The markup that remains
 * is what compiles — a `[NOTES]` block left in it would be staged as markup
 * and fail to compile.
 */
function splitNestedBlocks(body: string): { blocks: Map<string, string>; markup: string } {
	const blocks = new Map<string, string>();
	const kept: string[] = [];
	const lines = body.split('\n');
	let i = 0;
	while (i < lines.length) {
		const m = NESTED_BLOCK_RE.exec(lines[i]);
		if (!m) {
			kept.push(lines[i]);
			i++;
			continue;
		}
		const tag = m[1].toUpperCase();
		const closer = new RegExp(`^[ \\t]*\\[/${tag}\\][ \\t]*$`, 'i');
		let j = i + 1;
		const inner: string[] = [];
		while (j < lines.length && !closer.test(lines[j])) inner.push(lines[j++]);
		// An unclosed one keeps its lines as markup; the scanner reports it.
		if (j >= lines.length) {
			kept.push(lines[i]);
			i++;
			continue;
		}
		if (!blocks.has(tag)) blocks.set(tag, inner.join('\n'));
		i = j + 1;
	}
	return { blocks, markup: kept.join('\n') };
}

function parseExample(
	block: SubBlock,
	seenTitles: Set<string>,
	owner: 'SHOWCASE' | 'DOC',
	outerImports: Map<string, Span>,
	diagnostics: ScanError[],
): ExampleBlock {
	checkAttrs('[example]', block.attrs, SUB_BLOCK_ATTR_RULES.example, block.openerSpan, diagnostics);
	checkNestedScript(block.script, outerImports, diagnostics);
	const title = stringAttr(block.attrs, 'title') ?? '';
	if (title && seenTitles.has(title)) {
		diagnostics.push({
			code: 'duplicate-example-title',
			message: `Duplicate example title "${title}" — titles are unique within a [${owner}] block.`,
			span: block.openerSpan,
		});
	}
	seenTitles.add(title);
	// The nested text blocks come out of the body before anything is staged:
	// what remains is the markup that compiles.
	const nested = splitNestedBlocks(block.body);
	const nestedMarkup = splitNestedBlocks(block.markup);
	const asBlock = (text: string): SubBlock => ({ ...block, body: text });
	const notesBody = nested.blocks.get('NOTES');
	const todoBody = nested.blocks.get('TODO');
	const proseBody = nested.blocks.get('PROSE');
	return {
		title,
		description: stringAttr(block.attrs, 'description'),
		tags: listAttr(block.attrs, 'tags'),
		notes: notesBody === undefined ? [] : parseNoteLines(asBlock(notesBody), diagnostics),
		todos: todoBody === undefined ? [] : parseTodoItems(asBlock(todoBody), diagnostics),
		prose: proseBody === undefined ? null : normalizeBody(proseBody),
		showCode: showCodeAttr(block.attrs, block.openerSpan, diagnostics),
		sizing: sizingOf(block.attrs),
		body: normalizeBody(nested.markup),
		bodySpan: block.bodySpan,
		script: block.script,
		style: block.style,
		markup: normalizeBody(nestedMarkup.markup),
		span: block.span,
	};
}

/** The 'x-' prefix keeps example slugs clear of preview slugs, but a preview
 * label can still produce the same slug ("X Ray" → x-ray, example "Ray" →
 * x-ray), and two distinct example titles can slugify identically ("A B" /
 * "A-B"). The planner de-collides deterministically with a numeric suffix;
 * warn here so the author can pick titles with stable addresses. */
function checkSnippetSlugCollisions(
	previews: PreviewBlock[],
	examples: ExampleBlock[],
	exampleSpans: Span[],
	diagnostics: ScanError[],
): void {
	const previewSlugs = new Map<string, string>();
	for (const preview of previews) previewSlugs.set(previewSlug(preview.label), preview.label);
	const exampleSlugs = new Map<string, string>();
	examples.forEach((example, i) => {
		if (!example.title) return; // already reported as example-title-required
		const slug = exampleSlug(example.title);
		const previewLabel = previewSlugs.get(slug);
		const earlierTitle = exampleSlugs.get(slug);
		if (previewLabel !== undefined) {
			diagnostics.push({
				code: 'example-slug-collision',
				message: `Example "${example.title}" and preview "${previewLabel}" share the URL slug "${slug}" — the example gets a numbered suffix; retitle one to keep addresses stable.`,
				span: exampleSpans[i],
			});
		} else if (earlierTitle !== undefined && earlierTitle !== example.title) {
			// Identical titles are already reported as duplicate-example-title.
			diagnostics.push({
				code: 'example-slug-collision',
				message: `Examples "${earlierTitle}" and "${example.title}" share the URL slug "${slug}" — the second gets a numbered suffix; retitle one to keep addresses stable.`,
				span: exampleSpans[i],
			});
		}
		exampleSlugs.set(slug, example.title);
	});
}

/**
 * Collects the once-per-entity text blocks — `[NOTES]`, `[TODO]`, `[PROSE]`.
 *
 * Shared because every entity that takes them takes them the same way, and
 * because "once" has to be enforced somewhere that sees all of them: a second
 * block is reported rather than silently winning or losing.
 */
function textBlocks(owner: string, diagnostics: ScanError[], allowProse = true) {
	const seen = new Map<string, true>();
	let notes: DocNote[] = [];
	let todos: TodoItem[] = [];
	const prose: SubBlock[] = [];
	return {
		take(block: SubBlock) {
			if (block.kind === 'prose') {
				// A [DOC] body is markdown already: a [PROSE] block inside one
				// would be prose nested in prose, with no answer to where it
				// goes relative to the body that surrounds it.
				if (!allowProse) {
					diagnostics.push({
						code: 'prose-in-doc',
						message: `A ${owner} body is already prose — write it directly, without a [PROSE] block.`,
						span: block.openerSpan,
					});
					return;
				}
				prose.push(block);
				return;
			}
			const tag = block.kind === 'notes' ? 'NOTES' : 'TODO';
			if (seen.has(tag)) {
				diagnostics.push({
					code: 'duplicate-block',
					message: `Only one [${tag}] per ${owner} — merge them.`,
					span: block.openerSpan,
				});
				return;
			}
			seen.set(tag, true);
			if (block.kind === 'notes') notes = parseNoteLines(block, diagnostics);
			else todos = parseTodoItems(block, diagnostics);
		},
		get proseCount() {
			return prose.length;
		},
		get result() {
			return { notes, todos, prose: prose.map((b) => normalizeBody(b.body)) };
		},
	};
}

function parseShowcase(
	entity: Entity,
	fileImports: Map<string, Span>,
	diagnostics: ScanError[],
): ShowcaseEntity | PatternEntity {
	const kind = entity.kind as 'SHOWCASE' | 'PATTERNS';
	checkAttrs(`[${kind}]`, entity.attrs, ENTITY_ATTR_RULES[kind], entity.openerSpan, diagnostics);
	checkNestedScript(entity.script, fileImports, diagnostics);
	const outerImports = mergeImports(fileImports, entity.script);
	const previews: PreviewBlock[] = [];
	const examples: ExampleBlock[] = [];
	const exampleSpans: Span[] = [];
	const exampleTitles = new Set<string>();
	const previewLabels = new Set<string>();
	const text = textBlocks('[SHOWCASE]', diagnostics);
	const flow: FlowItem[] = [];
	const glossaries: GlossaryBlock[] = [];
	/** The one tab strip, added to the flow where the first [COMPONENT] was
	 * written. Every [COMPONENT] in the entity joins it: they share a stage,
	 * a code panel and an API table, so there is only ever one. */
	let tabs: { kind: 'components'; indices: number[] } | null = null;
	let bareComponents = 0;
	const containers = new Set<number>();

	for (const block of entity.blocks) {
		if (block.kind === 'preview') {
			// A composition has no one component whose API it could document, so
			// a props panel here would document a part and imply it was the
			// whole. The author wants the other entity; say which.
			if (kind === 'PATTERNS') {
				diagnostics.push({
					code: 'block-not-allowed',
					message:
						'[COMPONENT] is not allowed in a [PATTERNS] — a pattern documents a composition, which has no single component API. Use [SHOWCASE] for a component, or [EXAMPLE] to show this composition.',
					span: block.openerSpan,
				});
				continue;
			}
			const preview = parsePreview(block, outerImports, diagnostics);
			if (previewLabels.has(preview.label)) {
				diagnostics.push({
					code: 'duplicate-preview-label',
					message: `Two previews are both labeled "${preview.label}" — give one a title="…".`,
					span: block.openerSpan,
				});
			}
			previewLabels.add(preview.label);
			const index = previews.push(preview) - 1;
			const group = block.group ?? null;
			if (group === null) bareComponents++;
			else containers.add(group);
			// A lone [COMPONENT] needs no container. Two of them do: with prose
			// between them there is no correct place for the tab strip they
			// share, so refusing beats guessing.
			if (bareComponents === 2 || (bareComponents === 1 && containers.size > 0)) {
				diagnostics.push({
					code: 'components-need-container',
					message:
						'Two [COMPONENT] blocks in one [SHOWCASE] — wrap them all in one [COMPONENTS] so they share a tab strip.',
					span: block.openerSpan,
				});
				bareComponents = 0; // reported once, not once per block
			}
			if (containers.size === 2) {
				diagnostics.push({
					code: 'one-components-container',
					message:
						'One [COMPONENTS] per [SHOWCASE] — its blocks share a single tab strip, so a second container has nowhere to go.',
					span: block.openerSpan,
				});
				containers.delete(group!);
			}
			if (tabs) {
				tabs.indices.push(index);
			} else {
				tabs = { kind: 'components', indices: [index] };
				flow.push(tabs);
			}
		} else if (block.kind === 'example') {
			if (block.group != null) {
				diagnostics.push({
					code: 'block-in-components',
					message: '[COMPONENTS] holds [COMPONENT] blocks only — move this [EXAMPLE] outside it.',
					span: block.openerSpan,
				});
				continue;
			}
			flow.push({ kind: 'example', index: examples.length });
			examples.push(parseExample(block, exampleTitles, 'SHOWCASE', outerImports, diagnostics));
			exampleSpans.push(block.openerSpan);
		} else if (block.kind === 'glossary') {
			flow.push({ kind: 'glossary', index: glossaries.length });
			glossaries.push(parseGlossary(block, diagnostics));
		} else {
			if (block.group != null) {
				diagnostics.push({
					code: 'block-in-components',
					message: `[COMPONENTS] holds [COMPONENT] blocks only — move this [${block.tag.toUpperCase()}] outside it.`,
					span: block.openerSpan,
				});
				continue;
			}
			if (block.kind === 'prose') flow.push({ kind: 'prose', index: text.proseCount });
			text.take(block);
		}
	}
	checkSnippetSlugCollisions(previews, examples, exampleSpans, diagnostics);

	const title = stringAttr(entity.attrs, 'title') ?? '';
	const { notes, todos, prose } = text.result;
	return {
		// [PATTERNS] is this same entity with the prop half switched off —
		// same blocks, same flow, no previews.
		kind: entity.kind as 'SHOWCASE' | 'PATTERNS',
		title,
		slug: slugifyTitle(title),
		routeSlug: routeSlugAttr(entity.attrs, diagnostics),
		hide: bareAttr(entity.attrs, 'hide'),
		notes,
		todos,
		prose,
		flow,
		glossaries,
		description: stringAttr(entity.attrs, 'description'),
		sizing: sizingOf(entity.attrs),
		script: entity.script,
		style: entity.style,
		previews,
		examples,
		openerSpan: entity.openerSpan,
		span: entity.span,
	};
}

/**
 * Replace each [example] block in a DOC's raw body with a
 * `{@render __sdocsExample?.(i)}` marker at the opener's indentation, so the
 * markdown renderer passes it through verbatim and the Explorer renders the
 * example's stage in place.
 */
function spliceExampleMarkers(entity: Entity): string {
	if (entity.blocks.length === 0) return entity.body;
	let out = '';
	let from = 0;
	// Examples and glossaries leave a marker the doc renderer resolves, so they
	// render where they were written — mid-prose, in the flow. A text block
	// leaves nothing: it is rendered from the entity, not from the prose flow,
	// so its lines simply come out.
	let exampleIndex = 0;
	let glossaryIndex = 0;
	entity.blocks.forEach((block) => {
		const before = entity.body.slice(from, block.span.start - entity.bodySpan.start);
		const indent = before.slice(before.lastIndexOf('\n') + 1);
		out += before.slice(0, before.length - indent.length);
		if (block.kind === 'example') {
			out += `${indent}{@render __sdocsExample?.(${exampleIndex})}`;
			exampleIndex++;
		} else if (block.kind === 'glossary') {
			out += `${indent}{@render __sdocsGlossary?.(${glossaryIndex})}`;
			glossaryIndex++;
		}
		from = block.span.end - entity.bodySpan.start;
	});
	out += entity.body.slice(from);
	return out;
}

function parseDoc(
	entity: Entity,
	fileImports: Map<string, Span>,
	diagnostics: ScanError[],
): DocEntity {
	checkAttrs('[DOC]', entity.attrs, ENTITY_ATTR_RULES.DOC, entity.openerSpan, diagnostics);
	// A DOC entity script is lifted into both wrappers: its examples' iframe
	// stages AND the page component rendering the prose body.
	checkNestedScript(entity.script, fileImports, diagnostics, { stage: true, page: true });
	const outerImports = mergeImports(fileImports, entity.script);
	const examples: ExampleBlock[] = [];
	const exampleSpans: Span[] = [];
	const exampleTitles = new Set<string>();
	const text = textBlocks('[DOC]', diagnostics, false);
	const glossaries: GlossaryBlock[] = [];
	for (const block of entity.blocks) {
		if (block.kind === 'glossary') {
			glossaries.push(parseGlossary(block, diagnostics));
			continue;
		}
		if (block.kind !== 'example') {
			text.take(block);
			continue;
		}
		examples.push(parseExample(block, exampleTitles, 'DOC', outerImports, diagnostics));
		exampleSpans.push(block.openerSpan);
	}
	checkSnippetSlugCollisions([], examples, exampleSpans, diagnostics);
	const title = stringAttr(entity.attrs, 'title') ?? '';
	return {
		kind: 'DOC',
		title,
		slug: slugifyTitle(title),
		routeSlug: routeSlugAttr(entity.attrs, diagnostics),
		hide: bareAttr(entity.attrs, 'hide'),
		notes: text.result.notes,
		todos: text.result.todos,
		prose: [],
		glossaries,
		sizing: sizingOf(entity.attrs),
		script: entity.script,
		style: entity.style,
		body: normalizeBody(spliceExampleMarkers(entity)),
		examples,
		bodySpan: entity.bodySpan,
		openerSpan: entity.openerSpan,
		span: entity.span,
	};
}

export function parseSdoc(source: string): SdocDocument {
	const scanned: SdocFile = scanSdoc(source);
	const diagnostics: ScanError[] = [...scanned.errors];
	const entities: SdocEntity[] = [];
	const slugs = new Set<string>();
	const fileImports = scanned.script ? importedNames(scanned.script.content) : new Map<string, Span>();

	// The file <script> is lifted verbatim into every generated wrapper: the
	// iframe stage (previews, examples, LAYOUT content) AND the DOC/PAGE page
	// component — so every plumbing name is reserved here.
	if (scanned.script) {
		checkReservedNames(scanned.script, { stage: true, page: true }, diagnostics);
	}

	for (const entity of scanned.entities) {
		let typed: SdocEntity;
		if (entity.kind === 'SHOWCASE' || entity.kind === 'PATTERNS') {
			typed = parseShowcase(entity, fileImports, diagnostics);
		} else if (entity.kind === 'DOC') {
			typed = parseDoc(entity, fileImports, diagnostics);
		} else {
			// PAGE and LAYOUT share the shape: a plain Svelte body.
			const kind = entity.kind;
			checkAttrs(`[${kind}]`, entity.attrs, ENTITY_ATTR_RULES[kind], entity.openerSpan, diagnostics);
			const title = stringAttr(entity.attrs, 'title') ?? '';
			// LAYOUT content renders inside the iframe stage wrapper (which
			// declares `args`/`__sdocsRef`), so its script keeps the stage
			// reservations; a PAGE body renders through the plain page component
			// (which declares `__sdocsExample` via `$props()`), so those names
			// are reserved there instead — `args` stays free on PAGE.
			checkNestedScript(
				entity.script,
				fileImports,
				diagnostics,
				kind === 'PAGE' ? { stage: false, page: true } : STAGE_ONLY,
			);
			reportTextBlocksInBody(kind, entity, diagnostics);
			typed = {
				kind,
				title,
				slug: slugifyTitle(title),
				routeSlug: routeSlugAttr(entity.attrs, diagnostics),
				hide: bareAttr(entity.attrs, 'hide'),
				// Neither kind captures blocks: the scanner takes a [PAGE] or
				// [LAYOUT] body whole, as Svelte markup. Anything block-shaped in
				// there is reported rather than dropped — it used to pass silently
				// and render as literal text in the middle of the page.
				notes: [],
				todos: [],
				prose: [],
				sizing: sizingOf(entity.attrs),
				script: entity.script,
				style: entity.style,
				body: normalizeBody(entity.body),
				bodySpan: entity.bodySpan,
				openerSpan: entity.openerSpan,
				span: entity.span,
			} as PageEntity | LayoutEntity;
		}
		if (slugs.has(typed.slug)) {
			diagnostics.push({
				code: 'duplicate-entity-title',
				message: `Two entities in this file resolve to the same address ("${typed.slug}") — make their titles distinct.`,
				span: typed.openerSpan,
			});
		}
		slugs.add(typed.slug);
		entities.push(typed);
	}

	return {
		script: scanned.script,
		style: scanned.style,
		entities,
		diagnostics,
		source,
	};
}
