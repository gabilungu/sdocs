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
	type SubBlock,
	type TagBlock,
} from './scanner.js';
import { declaredBindings, scrubScriptText } from './script-scan.js';

export type ArgValue = string | number | boolean;

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

export interface ShowcaseEntity {
	kind: 'SHOWCASE';
	title: string;
	slug: string;
	/** Explicit route leaf from slug="…"; null → slugified title segment */
	routeSlug: string | null;
	/** `hide` flag: routable but never listed in a sidebar */
	hide: boolean;
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

export type SdocEntity = ShowcaseEntity | DocEntity | PageEntity | LayoutEntity;

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

/** Slug used for entity addressing: relPath + '#' + slug. */
export function slugifyTitle(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'untitled'
	);
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

const IDENTIFIER_RE = /^[A-Z][A-Za-z0-9_]*$/;

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
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
	example: {
		title: { required: true, kind: 'string', hint: 'title="…"', code: 'example-title-required' },
		description: { required: false, kind: 'string', hint: 'description="…"' },
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
};

/** Allowed attributes and their value shapes for a block, keyed by kind
 * ('SHOWCASE'|'DOC'|'PAGE'|'LAYOUT'|'preview'|'example'). Single source of
 * truth for both diagnostics and editor attribute completions. */
export function attributeRules(kind: string): Record<string, AttrRule> {
	// [component] is the canonical tag for the preview kind.
	const key = kind === 'component' ? 'preview' : kind;
	return ENTITY_ATTR_RULES[key] ?? SUB_BLOCK_ATTR_RULES[key] ?? {};
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
 * plain literals (strings, numbers, booleans). Anything richer belongs in
 * the block body, so it is rejected here.
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
		} else {
			return fail(
				`args value for "${key}" must be a plain literal (string, number, or boolean); richer values go in the block body.`,
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
	return {
		title,
		description: stringAttr(block.attrs, 'description'),
		sizing: sizingOf(block.attrs),
		body: normalizeBody(block.body),
		bodySpan: block.bodySpan,
		script: block.script,
		style: block.style,
		markup: normalizeBody(block.markup),
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

function parseShowcase(
	entity: Entity,
	fileImports: Map<string, Span>,
	diagnostics: ScanError[],
): ShowcaseEntity {
	checkAttrs('[SHOWCASE]', entity.attrs, ENTITY_ATTR_RULES.SHOWCASE, entity.openerSpan, diagnostics);
	checkNestedScript(entity.script, fileImports, diagnostics);
	const outerImports = mergeImports(fileImports, entity.script);
	const previews: PreviewBlock[] = [];
	const examples: ExampleBlock[] = [];
	const exampleSpans: Span[] = [];
	const exampleTitles = new Set<string>();
	const previewLabels = new Set<string>();

	for (const block of entity.blocks) {
		if (block.kind === 'preview') {
			const preview = parsePreview(block, outerImports, diagnostics);
			if (previewLabels.has(preview.label)) {
				diagnostics.push({
					code: 'duplicate-preview-label',
					message: `Two previews are both labeled "${preview.label}" — give one a title="…".`,
					span: block.openerSpan,
				});
			}
			previewLabels.add(preview.label);
			previews.push(preview);
		} else {
			examples.push(parseExample(block, exampleTitles, 'SHOWCASE', outerImports, diagnostics));
			exampleSpans.push(block.openerSpan);
		}
	}
	checkSnippetSlugCollisions(previews, examples, exampleSpans, diagnostics);

	const title = stringAttr(entity.attrs, 'title') ?? '';
	return {
		kind: 'SHOWCASE',
		title,
		slug: slugifyTitle(title),
		routeSlug: routeSlugAttr(entity.attrs, diagnostics),
		hide: bareAttr(entity.attrs, 'hide'),
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
	entity.blocks.forEach((block, i) => {
		const before = entity.body.slice(from, block.span.start - entity.bodySpan.start);
		const indent = before.slice(before.lastIndexOf('\n') + 1);
		out += before.slice(0, before.length - indent.length);
		out += `${indent}{@render __sdocsExample?.(${i})}`;
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
	for (const block of entity.blocks) {
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
		if (entity.kind === 'SHOWCASE') {
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
			typed = {
				kind,
				title,
				slug: slugifyTitle(title),
				routeSlug: routeSlugAttr(entity.attrs, diagnostics),
				hide: bareAttr(entity.attrs, 'hide'),
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
