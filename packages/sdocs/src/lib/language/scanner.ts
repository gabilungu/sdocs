/**
 * Syntactic scanner for v2 .sdoc files.
 *
 * A .sdoc file is: optional <script> at the top, entity blocks in the
 * middle ([SHOWCASE] / [DOC] / [PAGE] / [LAYOUT], with lowercase sub-blocks
 * [preview] / [example] inside [SHOWCASE] and [example] inside [DOC]),
 * optional <style> at the bottom.
 *
 * The scanner is line-anchored and non-balancing: tags are recognized only
 * at the start of a line and only where the current state allows them, so
 * block bodies may contain any text — including square brackets — without
 * escaping. Inside a body, only the matching closer line terminates it.
 *
 * This layer is purely syntactic: it reports structure, attribute values
 * and precise spans, and recovers from errors so an editor can keep
 * getting diagnostics for the rest of the file. Semantic validation
 * (required attributes, uniqueness, literal-only args) lives in parser.ts.
 */

import { stepFence, type FenceState } from './fences.js';

export interface Span {
	start: number;
	end: number;
}

export type EntityKind = 'SHOWCASE' | 'PATTERNS' | 'DOC' | 'PAGE' | 'LAYOUT';
export type SubBlockKind = 'preview' | 'example' | 'prose' | 'notes' | 'todo' | 'glossary';

export const ENTITY_KINDS: readonly EntityKind[] = ['SHOWCASE', 'PATTERNS', 'DOC', 'PAGE', 'LAYOUT'];
export const SUB_BLOCK_KINDS: readonly SubBlockKind[] = [
	'preview',
	'example',
	'prose',
	'notes',
	'todo',
	'glossary',
];

/** Blocks whose body is prose or a list rather than a Svelte fragment: they
 * are never staged, never compiled, and carry no block script or style. */
export const TEXT_BLOCK_KINDS: readonly SubBlockKind[] = ['prose', 'notes', 'todo'];

/** Tag names that open sub-blocks, in their canonical (uppercase) spelling.
 * `[COMPONENT]` documents a component (its internal kind is 'preview');
 * `[EXAMPLE]` is a frozen snippet. */
export const SUB_BLOCK_TAGS: readonly string[] = [
	'COMPONENT',
	'EXAMPLE',
	'GLOSSARY',
	'PROSE',
	'NOTES',
	'TODO',
];
const SUB_BLOCK_TAG_KINDS: Record<string, SubBlockKind> = {
	component: 'preview',
	example: 'example',
};

/**
 * Attribute-bearing blocks added after 0.0.139, matched **uppercase only**.
 *
 * `[COMPONENT]` and `[EXAMPLE]` take either casing because they existed in
 * lowercase and old files are never rewritten. Nothing added since has that
 * debt, and the stricter rule buys something: a line opening
 * `[glossary](/language/glossary)` is a markdown link, and stays one.
 */
const UPPERCASE_SUB_BLOCK_TAG_KINDS: Record<string, SubBlockKind> = {
	GLOSSARY: 'glossary',
};

const TEXT_BLOCK_TAG_KINDS: Record<string, SubBlockKind> = {
	NOTES: 'notes',
	TODO: 'todo',
	PROSE: 'prose',
};

/** `^[NOTES]$` and friends — uppercase, and nothing else on the line. */
const TEXT_BLOCK_RE = /^\[(NOTES|TODO|PROSE)\]$/;

/** `[COMPONENTS]` groups the `[COMPONENT]` blocks that share a tab strip.
 * Uppercase and alone on the line, for the same reason the text blocks are. */
const COMPONENTS_OPEN = '[COMPONENTS]';
const COMPONENTS_CLOSE = '[/COMPONENTS]';

/**
 * The text block a whole line opens, or null.
 *
 * Stricter than the other tags in two ways, and both are the same reason: a
 * markdown link is `[notes](…)`, which is prose that would otherwise scan as a
 * block opener. These blocks carry **no attributes**, so a line with anything
 * after the tag is not one of them; and they are **uppercase only**, having
 * never existed in lowercase, so `[notes](…)` in prose stays prose.
 */
export function textBlockKindOf(trimmedLine: string): SubBlockKind | null {
	const m = TEXT_BLOCK_RE.exec(trimmedLine);
	return m ? TEXT_BLOCK_TAG_KINDS[m[1]] : null;
}

/** The closer for a text block of `kind`. */
export function textBlockCloser(kind: SubBlockKind): string {
	const tag = Object.entries(TEXT_BLOCK_TAG_KINDS).find(([, k]) => k === kind)?.[0];
	return `[/${tag}]`;
}

/**
 * The kind a sub-block tag opens, or null for an unknown tag.
 *
 * **Case-insensitive on purpose.** Sub-blocks were lowercase until 0.0.139 and
 * uppercase after it, and old files are never rewritten by a release — the
 * formatter capitalizes them when a document is next formatted, and until then
 * both spellings mean the same block. Since formatting is opt-in, a file
 * nobody formats stays lowercase forever, so this is permanent rather than a
 * deprecation window.
 */
export function subBlockKindOf(name: string): SubBlockKind | null {
	return UPPERCASE_SUB_BLOCK_TAG_KINDS[name] ?? SUB_BLOCK_TAG_KINDS[name.toLowerCase()] ?? null;
}

export interface AttrValue {
	/** 'string' for name="text", 'expression' for name={expr}, 'bare' for a lone name */
	kind: 'string' | 'expression' | 'bare';
	/** Exact source between the quotes/braces ('' for bare attributes) */
	raw: string;
	/** Span of the whole attribute (name through closing quote/brace) */
	span: Span;
	/** Span of `raw` inside the source */
	valueSpan: Span;
}

export type Attrs = Record<string, AttrValue>;

export interface SubBlock {
	kind: SubBlockKind;
	/** Which `[COMPONENTS]` container this block was written in — 0 for the
	 * first in the entity, 1 for the next. Null when it was written directly
	 * in the entity body, which a lone `[COMPONENT]` may be. */
	group?: number | null;
	/** The tag as written — 'component', 'preview' (alias), or 'example' —
	 * so diagnostics can name the block the author actually typed. */
	tag: string;
	attrs: Attrs;
	/** Raw body between the opener line and the closer line (script/style included) */
	body: string;
	bodySpan: Span;
	/** Optional block-level <script> — must be the first content of the body */
	script: TagBlock | null;
	/** Optional block-level <style> — must be the last content of the body */
	style: TagBlock | null;
	/** Raw markup between the block script and block style (the whole body
	 * when the block declares neither) */
	markup: string;
	markupSpan: Span;
	openerSpan: Span;
	span: Span;
}

export interface Entity {
	kind: EntityKind;
	attrs: Attrs;
	/** SHOWCASE: preview/example sub-blocks. DOC: example sub-blocks.
	 * PAGE/LAYOUT: always empty. */
	blocks: SubBlock[];
	/** Entity-level <script> — the first content of the entity body */
	script: TagBlock | null;
	/** Entity-level <style> — the last content of the entity body */
	style: TagBlock | null;
	/** DOC/PAGE/LAYOUT: the raw body (for DOC it includes any [example] blocks,
	 * addressable via their spans). SHOWCASE: '' (body text between blocks is an error). */
	body: string;
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

/** A top-level <script> or <style> tag block. */
export interface TagBlock {
	/** Raw text between the tag name and '>', e.g. ' lang="ts"' */
	attrsText: string;
	content: string;
	contentSpan: Span;
	span: Span;
}

export interface ScanError {
	code: string;
	message: string;
	span: Span;
}

export interface SdocFile {
	script: TagBlock | null;
	style: TagBlock | null;
	entities: Entity[];
	errors: ScanError[];
	source: string;
}

interface Line {
	start: number;
	end: number; // offset of '\n' (or source.length on the last line)
	text: string;
}

function splitLines(source: string): Line[] {
	const lines: Line[] = [];
	let start = 0;
	for (let i = 0; i <= source.length; i++) {
		if (i === source.length || source[i] === '\n') {
			lines.push({ start, end: i, text: source.slice(start, i) });
			start = i + 1;
		}
	}
	return lines;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*/;

/**
 * Where to resume after a stray character in an opener: past the closing `]`
 * when one is still on this line, otherwise at the line's end.
 *
 * Treating the opener as finished there keeps the block's body and closer
 * scannable, which is what lets the SAME mistake on a later opener be reported
 * in the same pass. Abandoning the file instead turns one typo repeated three
 * times into three fix-and-revalidate rounds.
 */
function recoverOpenerEnd(source: string, from: number): number {
	for (let i = from; i < source.length; i++) {
		if (source[i] === ']') return i + 1;
		// The newline offset, not past it: the opener's line ends here, so
		// nothing is left over to report as trailing text.
		if (source[i] === '\n') return i;
	}
	return source.length;
}

/** Scan an opener's attributes starting right after `[KIND`. Handles
 * multi-line openers and quote/brace nesting. Returns the offset just past
 * the closing ']', or -1 when the opener cannot be recovered from. */
function scanOpenerAttrs(
	source: string,
	from: number,
	attrs: Attrs,
	errors: ScanError[],
): number {
	let i = from;
	while (i < source.length) {
		const ch = source[i];
		if (ch === ']') return i + 1;
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		const nameMatch = source.slice(i).match(NAME_RE);
		if (!nameMatch) {
			// `>` is the slip worth naming: the attributes are Svelte/HTML
			// syntax, so the hand finishes an HTML tag. Saying which bracket
			// closes an opener turns a lookup into a fix.
			const hint =
				ch === '>' ? " Block openers close with ']', not '>' — the attributes are HTML-like, the brackets are not." : '';
			errors.push({
				code: 'attr-syntax',
				message: `Unexpected character '${ch}' in block opener.${hint}`,
				span: { start: i, end: i + 1 },
			});
			// Recoverable: the attributes read so far are kept and scanning
			// continues, so every opener with this mistake is reported at once.
			return recoverOpenerEnd(source, i);
		}
		const name = nameMatch[0];
		const nameStart = i;
		i += name.length;
		if (source[i] !== '=') {
			addAttr(attrs, errors, name, {
				kind: 'bare',
				raw: '',
				span: { start: nameStart, end: i },
				valueSpan: { start: i, end: i },
			});
			continue;
		}
		i++; // '='
		if (source[i] === '"') {
			const quoteStart = i;
			const valueStart = i + 1;
			const newline = source.indexOf('\n', valueStart);
			const lineEnd = newline === -1 ? source.length : newline;
			const close = source.indexOf('"', valueStart);
			// A quoted value never crosses a line break. Searching to end of file
			// meant the next `"` anywhere in the document closed it — usually the
			// one on some later entity's opener — so the value swallowed every
			// line between, the blocks inside that range disappeared, and the
			// four diagnostics that came out were all downstream of a mistake
			// none of them pointed at. Anchoring the report on the opening quote
			// is what turns it back into a one-line fix.
			if (close === -1 || close > lineEnd) {
				errors.push({
					code: 'unterminated-attr-string',
					message: `Unterminated string value for attribute "${name}" — a quoted value must close with '"' on the same line.`,
					span: { start: quoteStart, end: quoteStart + 1 },
				});
				// The same recovery the stray-character branch uses: end the opener
				// at the `]` still on this line, or at the line break. The document
				// keeps parsing, so the diagnostic is the only loss.
				const end = recoverOpenerEnd(source, valueStart);
				const rawEnd = source[end - 1] === ']' ? end - 1 : end;
				const raw = source.slice(valueStart, rawEnd).replace(/\s+$/, '');
				addAttr(attrs, errors, name, {
					kind: 'string',
					raw,
					span: { start: nameStart, end: valueStart + raw.length },
					valueSpan: { start: valueStart, end: valueStart + raw.length },
				});
				return end;
			}
			addAttr(attrs, errors, name, {
				kind: 'string',
				raw: source.slice(valueStart, close),
				span: { start: nameStart, end: close + 1 },
				valueSpan: { start: valueStart, end: close },
			});
			i = close + 1;
		} else if (source[i] === '{') {
			const valueStart = i + 1;
			const close = scanBalancedBraces(source, i);
			if (close === -1) {
				errors.push({
					code: 'attr-syntax',
					message: `Unterminated expression value for attribute "${name}".`,
					span: { start: nameStart, end: source.length },
				});
				return -1;
			}
			addAttr(attrs, errors, name, {
				kind: 'expression',
				raw: source.slice(valueStart, close),
				span: { start: nameStart, end: close + 1 },
				valueSpan: { start: valueStart, end: close },
			});
			i = close + 1;
		} else {
			errors.push({
				code: 'attr-syntax',
				message: `Attribute "${name}" must have a "string" or {expression} value.`,
				span: { start: nameStart, end: i },
			});
			return -1;
		}
	}
	errors.push({
		code: 'attr-syntax',
		message: 'Block opener is missing its closing "]".',
		span: { start: from, end: source.length },
	});
	return -1;
}

function addAttr(attrs: Attrs, errors: ScanError[], name: string, value: AttrValue): void {
	if (attrs[name]) {
		errors.push({
			code: 'duplicate-attr',
			message: `Duplicate attribute "${name}".`,
			span: value.span,
		});
		return;
	}
	attrs[name] = value;
}

/** Given source[open] === '{', return the offset of the matching '}',
 * skipping strings and nested braces. -1 when unterminated. */
function scanBalancedBraces(source: string, open: number): number {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "'" || ch === '"' || ch === '`') {
			i = skipString(source, i);
			if (i === -1) return -1;
			continue;
		}
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/** Given source[at] is a quote, return the offset of the closing quote. */
function skipString(source: string, at: number): number {
	const quote = source[at];
	for (let i = at + 1; i < source.length; i++) {
		if (source[i] === '\\') {
			i++;
			continue;
		}
		if (source[i] === quote) return i;
	}
	return -1;
}

/** True when a trimmed line starts a real <script>/<style> opener: the tag
 * name must end at a boundary (whitespace, '>', '/', or the line end for a
 * multi-line opener), so custom elements like <styled-note> or
 * <scripted-demo> flow through as ordinary content. */
function startsTag(trimmed: string, tag: 'script' | 'style'): boolean {
	if (!trimmed.startsWith(`<${tag}`)) return false;
	const next = trimmed[tag.length + 1];
	return next === undefined || next === '>' || next === '/' || /\s/.test(next);
}

/** Find the '>' that closes a tag opener starting at `from`, skipping '>'
 * characters inside quoted attribute values (e.g. generics="Record<K, V>").
 * -1 when no closing '>' exists. */
function findTagEnd(source: string, from: number): number {
	for (let i = from; i < source.length; i++) {
		const ch = source[i];
		if (ch === '"' || ch === "'") {
			const close = source.indexOf(ch, i + 1);
			if (close === -1) return -1;
			i = close;
			continue;
		}
		if (ch === '>') return i;
	}
	return -1;
}

/** Parse a `[name` / `[/name` token at the start of a trimmed line. */
function tagToken(trimmed: string): { name: string; closer: boolean } | null {
	const m = trimmed.match(/^\[(\/?)([A-Za-z][A-Za-z0-9_-]*)/);
	if (!m) return null;
	return { name: m[2], closer: m[1] === '/' };
}

function isEntityKind(name: string): name is EntityKind {
	return (ENTITY_KINDS as readonly string[]).includes(name);
}


export function scanSdoc(source: string): SdocFile {
	const lines = splitLines(source);
	const errors: ScanError[] = [];
	const entities: Entity[] = [];
	let script: TagBlock | null = null;
	let style: TagBlock | null = null;

	let li = 0;

	/** Skip an HTML comment starting on line `li` at trimmed position; returns the next line index. */
	function skipComment(startLi: number): number {
		const startOffset = lines[startLi].start + lines[startLi].text.indexOf('<!--');
		const close = source.indexOf('-->', startOffset + 4);
		if (close === -1) {
			errors.push({
				code: 'unclosed-comment',
				message: 'Unclosed HTML comment.',
				span: { start: startOffset, end: source.length },
			});
			return lines.length;
		}
		let i = startLi;
		while (i < lines.length && lines[i].end < close + 3) i++;
		const rest = source.slice(close + 3, lines[i].end);
		if (rest.trim() !== '') {
			errors.push({
				code: 'text-outside-blocks',
				message: 'Unexpected text after comment.',
				span: { start: close + 3, end: lines[i].end },
			});
		}
		return i + 1;
	}

	/** Capture a <script>/<style> tag block whose opener starts line `li`. */
	function captureTag(tag: 'script' | 'style', startLi: number): { block: TagBlock; nextLi: number } | null {
		const openLine = lines[startLi];
		const openStart = openLine.start + openLine.text.indexOf(`<${tag}`);
		const openEnd = findTagEnd(source, openStart);
		if (openEnd === -1) {
			errors.push({
				code: 'tag-syntax',
				message: `Malformed <${tag}> tag.`,
				span: { start: openStart, end: openLine.end },
			});
			return null;
		}
		const closeIdx = source.indexOf(`</${tag}>`, openEnd + 1);
		if (closeIdx === -1) {
			errors.push({
				code: 'unclosed-tag',
				message: `Missing </${tag}>.`,
				span: { start: openStart, end: source.length },
			});
			return null;
		}
		const closeEnd = closeIdx + `</${tag}>`.length;
		let i = startLi;
		while (i < lines.length && lines[i].end < closeEnd) i++;
		const rest = source.slice(closeEnd, lines[i].end);
		if (rest.trim() !== '') {
			errors.push({
				code: 'text-outside-blocks',
				message: `Unexpected text after </${tag}>.`,
				span: { start: closeEnd, end: lines[i].end },
			});
		}
		return {
			block: {
				attrsText: source.slice(openStart + tag.length + 1, openEnd),
				content: source.slice(openEnd + 1, closeIdx),
				contentSpan: { start: openEnd + 1, end: closeIdx },
				span: { start: openStart, end: closeEnd },
			},
			nextLi: i + 1,
		};
	}

	/** Scan an entity or sub-block opener starting at line `li`. Returns the
	 * attrs, the opener span, and the line index after the opener. */
	function scanOpener(
		startLi: number,
		kindLen: number,
	): { attrs: Attrs; openerSpan: Span; nextLi: number } | null {
		const line = lines[startLi];
		const bracketStart = line.start + line.text.indexOf('[');
		const attrs: Attrs = {};
		const end = scanOpenerAttrs(source, bracketStart + 1 + kindLen, attrs, errors);
		if (end === -1) return null;
		let i = startLi;
		while (i < lines.length && lines[i].end < end) i++;
		const rest = source.slice(end, lines[i].end);
		if (rest.trim() !== '') {
			errors.push({
				code: 'tag-not-alone',
				message: 'A block opener must be alone on its line.',
				span: { start: end, end: lines[i].end },
			});
		}
		return { attrs, openerSpan: { start: bracketStart, end }, nextLi: i + 1 };
	}

	/** Collect raw body lines until the exact closer line `[/kind]`. */
	function captureBody(
		startLi: number,
		closer: string,
	): { body: string; bodySpan: Span; closerSpan: Span; nextLi: number } | null {
		const bodyStart = startLi < lines.length ? lines[startLi].start : source.length;
		for (let i = startLi; i < lines.length; i++) {
			if (lines[i].text.trim() === closer) {
				const bodyEnd = i > 0 ? lines[i - 1].end : bodyStart;
				const tagStart = lines[i].start + lines[i].text.indexOf(closer);
				return {
					body: source.slice(bodyStart, Math.max(bodyStart, bodyEnd)),
					bodySpan: { start: bodyStart, end: Math.max(bodyStart, bodyEnd) },
					closerSpan: { start: tagStart, end: tagStart + closer.length },
					nextLi: i + 1,
				};
			}
		}
		return null;
	}

	/** Capture a <script>/<style> tag bounded to a block body: the closer must
	 * appear before `boundEnd` (the body's end — the block closer line ends it). */
	function captureBoundedTag(
		tag: 'script' | 'style',
		startLi: number,
		boundEnd: number,
		blockCloser: string,
	): { block: TagBlock; nextLi: number } | null {
		const openLine = lines[startLi];
		const openStart = openLine.start + openLine.text.indexOf(`<${tag}`);
		const openEnd = findTagEnd(source, openStart);
		if (openEnd === -1 || openEnd > boundEnd) {
			errors.push({
				code: 'tag-syntax',
				message: `Malformed <${tag}> tag.`,
				span: { start: openStart, end: openLine.end },
			});
			return null;
		}
		const closeIdx = source.indexOf(`</${tag}>`, openEnd + 1);
		if (closeIdx === -1 || closeIdx >= boundEnd) {
			errors.push({
				code: 'unclosed-tag',
				message: `Missing </${tag}> before ${blockCloser}.`,
				span: { start: openStart, end: boundEnd },
			});
			return null;
		}
		const closeEnd = closeIdx + `</${tag}>`.length;
		let i = startLi;
		while (i < lines.length && lines[i].end < closeEnd) i++;
		const rest = source.slice(closeEnd, lines[i].end);
		if (rest.trim() !== '') {
			errors.push({
				code: 'tag-not-alone',
				message: `Unexpected text after </${tag}>.`,
				span: { start: closeEnd, end: lines[i].end },
			});
		}
		return {
			block: {
				attrsText: source.slice(openStart + tag.length + 1, openEnd),
				content: source.slice(openEnd + 1, closeIdx),
				contentSpan: { start: openEnd + 1, end: closeIdx },
				span: { start: openStart, end: closeEnd },
			},
			nextLi: i + 1,
		};
	}

	/** Find the line index of the entity's own closer (a line whose trim equals
	 * `closer`) at or after `fromLi`, so an entity-level tag capture never
	 * crosses it into a later entity. `fenced` skips closer-looking lines
	 * inside markdown code fences (DOC prose shows tag syntax in fences).
	 * Returns lines.length when the entity is unclosed. */
	function findCloserLine(fromLi: number, closer: string, fenced = false): number {
		const state: { fence: FenceState } = { fence: null };
		for (let i = fromLi; i < lines.length; i++) {
			if (fenced && stepFence(state, lines[i].text).inside) continue;
			if (lines[i].text.trim() === closer) return i;
		}
		return lines.length;
	}

	/** The capture bound for an entity-level tag: the end of the last line
	 * before the entity's closer (mirroring scanSubBlockBody's bodyEnd), or
	 * the end of the source when the entity is unclosed. */
	function closerBound(closerLi: number): number {
		return closerLi < lines.length ? lines[closerLi - 1].end : source.length;
	}

	/** Sub-scan a captured [preview]/[example] body for an optional leading
	 * <script> and trailing <style>. Body lines run from `fromLi` up to (not
	 * including) `closerLi`. Only the first/last positions are special — a
	 * `<script>`/`<style>` line elsewhere in the markup is flagged, since in a
	 * block it is almost certainly a misplaced block tag, not a DOM element. */
	function scanSubBlockBody(
		fromLi: number,
		closerLi: number,
		kind: string,
		level: 'block' | 'entity' = 'block',
	): { script: TagBlock | null; style: TagBlock | null; markupSpan: Span } {
		const closer = `[/${kind}]`;
		const bodyEnd = closerLi > fromLi ? lines[closerLi - 1].end : lines[fromLi]?.start ?? source.length;
		let script: TagBlock | null = null;
		let style: TagBlock | null = null;

		let j = fromLi;
		while (j < closerLi && lines[j].text.trim() === '') j++;
		if (j < closerLi && startsTag(lines[j].text.trim(), 'script')) {
			const captured = captureBoundedTag('script', j, bodyEnd, closer);
			if (captured) {
				script = captured.block;
				j = captured.nextLi;
			} else {
				// The unclosed-tag error is already reported; skip the opener line
				// so the markup pass doesn't add a contradictory position error.
				j++;
			}
		}

		const markupStart = j < closerLi ? lines[j].start : bodyEnd;
		let markupEnd = markupStart;
		while (j < closerLi) {
			const trimmed = lines[j].text.trim();
			if (startsTag(trimmed, 'style')) {
				const captured = captureBoundedTag('style', j, bodyEnd, closer);
				if (!captured) {
					j++;
					continue;
				}
				style = captured.block;
				for (let k = captured.nextLi; k < closerLi; k++) {
					if (lines[k].text.trim() !== '') {
						errors.push({
							code: `${level}-style-position`,
							message: `A ${level} <style> must be the last content of its [${kind}] ${level === 'block' ? 'block' : 'body'}.`,
							span: captured.block.span,
						});
						break;
					}
				}
				break;
			}
			if (startsTag(trimmed, 'script')) {
				errors.push({
					code: `${level}-script-position`,
					message: `A ${level} <script> must be the first content of its [${kind}] ${level === 'block' ? 'block' : 'body'}.`,
					span: { start: lines[j].start + lines[j].text.indexOf('<script'), end: lines[j].end },
				});
			}
			if (trimmed !== '') markupEnd = lines[j].end;
			j++;
		}

		return {
			script,
			style,
			markupSpan: { start: markupStart, end: Math.max(markupStart, markupEnd) },
		};
	}

	/** Scan the inside of a [SHOWCASE] entity until its closer. */
	function scanShowcaseBody(startLi: number, entity: Entity): number {
		// [SHOWCASE] and [PATTERNS] have the same body: blocks, no loose text.
		// The closer is the only thing that differs, so it comes from the
		// entity rather than being written into the scan seven times.
		const CLOSER = `[/${entity.kind}]`;
		let i = startLi;
		let sawContent = false;
		let styleMisplacedReported = false;
		/** The [COMPONENTS] container currently open, and how many have been
		 * seen — a block written outside one carries null. */
		let group: number | null = null;
		let groups = 0;
		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.text.trim();
			if (trimmed === '') {
				i++;
				continue;
			}
			if (trimmed.startsWith('<!--')) {
				i = skipComment(i);
				continue;
			}
			if (startsTag(trimmed, 'script')) {
				if (sawContent || entity.script) {
					errors.push({
						code: 'entity-script-position',
						message: `An entity <script> must be the first content of its [${entity.kind}] body.`,
						span: { start: line.start + line.text.indexOf('<script'), end: line.end },
					});
					i++;
					continue;
				}
				const closerLi = findCloserLine(i, `[/${entity.kind}]`);
				const captured = captureBoundedTag('script', i, closerBound(closerLi), `[/${entity.kind}]`);
				if (!captured) {
					// The targeted missing-closer error is already reported; resume
					// at the entity's own closer so later entities keep parsing.
					i = closerLi;
					continue;
				}
				entity.script = captured.block;
				i = captured.nextLi;
				continue;
			}
			if (startsTag(trimmed, 'style')) {
				const closerLi = findCloserLine(i, `[/${entity.kind}]`);
				const captured = captureBoundedTag('style', i, closerBound(closerLi), `[/${entity.kind}]`);
				if (!captured) {
					i = closerLi;
					continue;
				}
				if (entity.style) {
					errors.push({
						code: 'entity-style-position',
						message: `Only one entity <style> is allowed in a [${entity.kind}] body.`,
						span: captured.block.span,
					});
				} else {
					entity.style = captured.block;
				}
				i = captured.nextLi;
				continue;
			}
			// Anything after a captured <style> means it wasn't last. Unlike DOC
			// there is no prose to demote it into (loose text here is itself an
			// error), so keep the capture: the CSS still applies exactly once and
			// the position diagnostic stands alone, without a cascade.
			if (entity.style && trimmed !== CLOSER && !styleMisplacedReported) {
				styleMisplacedReported = true;
				errors.push({
					code: 'entity-style-position',
					message: `An entity <style> must be the last content of its [${entity.kind}] body.`,
					span: entity.style.span,
				});
			}
			sawContent = true;
			const token = tagToken(trimmed);
			if (token && token.closer && token.name === entity.kind && trimmed === CLOSER) {
				if (group !== null) {
					errors.push({
						code: 'unclosed-block',
						message: `Missing ${COMPONENTS_CLOSE}.`,
						span: { start: line.start, end: line.end },
					});
				}
				const tagStart = line.start + line.text.indexOf(CLOSER);
				entity.span.end = tagStart + CLOSER.length;
				return i + 1;
			}
			if (trimmed === COMPONENTS_OPEN) {
				if (group !== null) {
					errors.push({
						code: 'nested-components',
						message: `[COMPONENTS] cannot hold another [COMPONENTS].`,
						span: { start: line.start, end: line.end },
					});
				} else {
					group = groups++;
				}
				i++;
				continue;
			}
			if (trimmed === COMPONENTS_CLOSE) {
				if (group === null) {
					errors.push({
						code: 'stray-closer',
						message: `Unexpected closer ${COMPONENTS_CLOSE} — no [COMPONENTS] is open.`,
						span: { start: line.start, end: line.end },
					});
				}
				group = null;
				i++;
				continue;
			}
			const textKind = textBlockKindOf(trimmed);
			if (textKind) {
				const captured = captureBody(i + 1, textBlockCloser(textKind));
				if (!captured) {
					errors.push({
						code: 'unclosed-block',
						message: `Missing ${textBlockCloser(textKind)}.`,
						span: { start: line.start, end: line.end },
					});
					return lines.length;
				}
				entity.blocks.push({
					kind: textKind,
					group,
					tag: trimmed.slice(1, -1),
					attrs: {},
					body: captured.body,
					bodySpan: captured.bodySpan,
					script: null,
					style: null,
					markup: captured.body,
					markupSpan: captured.bodySpan,
					openerSpan: { start: line.start + line.text.indexOf('['), end: line.end },
					span: { start: line.start + line.text.indexOf('['), end: captured.closerSpan.end },
				});
				i = captured.nextLi;
				continue;
			}
			if (token && !token.closer && subBlockKindOf(token.name)) {
				const opener = scanOpener(i, token.name.length);
				if (!opener) return lines.length;
				const captured = captureBody(opener.nextLi, `[/${token.name}]`);
				if (!captured) {
					errors.push({
						code: 'unclosed-block',
						message: `Missing [/${token.name}].`,
						span: opener.openerSpan,
					});
					return lines.length;
				}
				const kind = subBlockKindOf(token.name)!;
				const sub = scanSubBlockBody(opener.nextLi, captured.nextLi - 1, token.name);
				entity.blocks.push({
					kind,
					group,
					tag: token.name,
					attrs: opener.attrs,
					body: captured.body,
					bodySpan: captured.bodySpan,
					script: sub.script,
					style: sub.style,
					markup: source.slice(sub.markupSpan.start, sub.markupSpan.end),
					markupSpan: sub.markupSpan,
					openerSpan: opener.openerSpan,
					span: { start: opener.openerSpan.start, end: captured.closerSpan.end },
				});
				i = captured.nextLi;
				continue;
			}
			const span = { start: line.start + line.text.indexOf(trimmed[0]), end: line.end };
			if (token && !token.closer && isEntityKind(token.name)) {
				errors.push({
					code: 'unclosed-block',
					message: `Missing ${CLOSER} before the next entity.`,
					span,
				});
				entity.span.end = line.start;
				return i; // recover: let the outer loop re-read this line
			}
			if (token) {
				errors.push({
					code: token.closer ? 'stray-closer' : 'unknown-tag',
					message: token.closer
						? `Unexpected closer [/${token.name}] inside [${entity.kind}].`
						: `Unknown block [${token.name}] inside [${entity.kind}] — expected [COMPONENT], [COMPONENTS], [EXAMPLE], [GLOSSARY], [NOTES], [TODO] or [PROSE].`,
					span,
				});
				i++;
				continue;
			}
			errors.push({
				code: 'text-outside-blocks',
				message: `Text inside [${entity.kind}] must be inside a ${entity.kind === 'PATTERNS' ? '[EXAMPLE]' : '[component] or [example]'} block.`,
				span,
			});
			i++;
		}
		errors.push({
			code: 'unclosed-block',
			message: `Missing ${CLOSER}.`,
			span: entity.openerSpan,
		});
		entity.span.end = source.length;
		return lines.length;
	}

	/** Scan the inside of a [DOC] entity until its closer: prose lines are
	 * body text, [example] openers capture sub-blocks. Lines inside markdown
	 * code fences are always prose, so a fence may show block syntax without
	 * escaping. The body keeps the raw text of the whole range — example
	 * blocks included — so consumers can splice by span. */
	function scanDocBody(startLi: number, entity: Entity): number {
		// Entity-level <script>: the first content of the body, before prose.
		let i = startLi;
		while (i < lines.length && lines[i].text.trim() === '') i++;
		if (i < lines.length && startsTag(lines[i].text.trim(), 'script')) {
			const closerLi = findCloserLine(i, '[/DOC]', true);
			const captured = captureBoundedTag('script', i, closerBound(closerLi), '[/DOC]');
			if (captured) {
				entity.script = captured.block;
				i = captured.nextLi;
			} else {
				// The targeted missing-closer error is already reported; resume at
				// the entity's own closer so later entities keep parsing.
				i = closerLi;
			}
		}
		const bodyStart = i < lines.length ? lines[i].start : source.length;
		let bodyEnd = bodyStart;
		let fence: { marker: string; len: number } | null = null;
		let styleMisplacedReported = false;
		// Content after a captured <style> means it wasn't the trailing entity
		// style after all: report it, then demote it to plain prose — folded
		// back into the body span so the CSS renders exactly once, as authored,
		// instead of applying both inline and via the entity-style injection.
		const demoteMisplacedStyle = () => {
			if (!entity.style) return;
			if (!styleMisplacedReported) {
				styleMisplacedReported = true;
				errors.push({
					code: 'entity-style-position',
					message: 'An entity <style> must be the last content of its [DOC] body.',
					span: entity.style.span,
				});
			}
			bodyEnd = Math.max(bodyEnd, entity.style.span.end);
			entity.style = null;
		};
		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.text.trim();
			const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
			if (fenceMatch && !fence) {
				demoteMisplacedStyle();
				fence = { marker: fenceMatch[1][0], len: fenceMatch[1].length };
				bodyEnd = line.end;
				i++;
				continue;
			}
			if (fence) {
				// CommonMark: a fence closes only on the SAME marker character with
				// AT LEAST as many chars; anything else — other markers included —
				// is fenced content.
				if (
					fenceMatch &&
					fenceMatch[1][0] === fence.marker &&
					fenceMatch[1].length >= fence.len
				) {
					fence = null;
					bodyEnd = line.end;
					i++;
					continue;
				}
				if (trimmed !== '') bodyEnd = line.end;
				i++;
				continue;
			}
			if (startsTag(trimmed, 'style')) {
				const closerLi = findCloserLine(i, '[/DOC]', true);
				const captured = captureBoundedTag('style', i, closerBound(closerLi), '[/DOC]');
				if (!captured) {
					i = closerLi;
					continue;
				}
				if (entity.style) {
					errors.push({
						code: 'entity-style-position',
						message: 'Only one entity <style> is allowed in a [DOC] body.',
						span: captured.block.span,
					});
				} else {
					entity.style = captured.block;
				}
				// Not prose: the style is excluded from the body span.
				i = captured.nextLi;
				continue;
			}
			if (trimmed !== '' && trimmed !== '[/DOC]') demoteMisplacedStyle();
			if (trimmed === '[/DOC]') {
				const tagStart = line.start + line.text.indexOf('[/DOC]');
				entity.body = source.slice(bodyStart, Math.max(bodyStart, bodyEnd));
				entity.bodySpan = { start: bodyStart, end: Math.max(bodyStart, bodyEnd) };
				entity.span.end = tagStart + '[/DOC]'.length;
				return i + 1;
			}
			const token = tagToken(trimmed);
			// Matched by kind, not by spelling: a DOC's blocks come in either
			// casing like everywhere else, and the closer has to be the one
			// this opener actually used. A DOC takes examples and the text
			// blocks; only [COMPONENT] is refused, below.
			const docTextKind = textBlockKindOf(trimmed);
			if (docTextKind) {
				const captured = captureBody(i + 1, textBlockCloser(docTextKind));
				if (!captured) {
					errors.push({
						code: 'unclosed-block',
						message: `Missing ${textBlockCloser(docTextKind)}.`,
						span: { start: line.start, end: line.end },
					});
					return lines.length;
				}
				entity.blocks.push({
					kind: docTextKind,
					tag: trimmed.slice(1, -1),
					attrs: {},
					body: captured.body,
					bodySpan: captured.bodySpan,
					script: null,
					style: null,
					markup: captured.body,
					markupSpan: captured.bodySpan,
					openerSpan: { start: line.start + line.text.indexOf('['), end: line.end },
					span: { start: line.start + line.text.indexOf('['), end: captured.closerSpan.end },
				});
				bodyEnd = captured.closerSpan.end;
				i = captured.nextLi;
				continue;
			}
			// [EXAMPLE] and [GLOSSARY] are the two blocks that render *in* a doc's
			// prose rather than beside it: the parser splices a marker where each
			// was written, and the compiled page resolves it there.
			const docKind = token && !token.closer ? subBlockKindOf(token.name) : null;
			if (token && (docKind === 'example' || docKind === 'glossary')) {
				const opener = scanOpener(i, token.name.length);
				if (!opener) return lines.length;
				const closer = `[/${token.name}]`;
				const captured = captureBody(opener.nextLi, closer);
				if (!captured) {
					errors.push({
						code: 'unclosed-block',
						message: `Missing ${closer}.`,
						span: opener.openerSpan,
					});
					return lines.length;
				}
				const sub = scanSubBlockBody(opener.nextLi, captured.nextLi - 1, token.name);
				entity.blocks.push({
					kind: docKind,
					tag: token.name,
					attrs: opener.attrs,
					body: captured.body,
					bodySpan: captured.bodySpan,
					script: sub.script,
					style: sub.style,
					markup: source.slice(sub.markupSpan.start, sub.markupSpan.end),
					markupSpan: sub.markupSpan,
					openerSpan: opener.openerSpan,
					span: { start: opener.openerSpan.start, end: captured.closerSpan.end },
				});
				bodyEnd = captured.closerSpan.end;
				i = captured.nextLi;
				continue;
			}
			if (token && !token.closer && subBlockKindOf(token.name) === 'preview') {
				errors.push({
					code: 'unknown-tag',
					message: `[${token.name}] is only valid inside [SHOWCASE] — docs showcase with [example].`,
					span: { start: line.start + line.text.indexOf('['), end: line.end },
				});
				i++;
				continue;
			}
			// Everything else — prose, markdown, islands, stray brackets — is body.
			if (trimmed !== '') bodyEnd = line.end;
			i++;
		}
		errors.push({
			code: 'unclosed-block',
			message: 'Missing [/DOC].',
			span: entity.openerSpan,
		});
		entity.body = source.slice(bodyStart);
		entity.bodySpan = { start: bodyStart, end: source.length };
		entity.span.end = source.length;
		return lines.length;
	}

	// ---- main loop over top-level lines ----
	while (li < lines.length) {
		const line = lines[li];
		const trimmed = line.text.trim();
		if (trimmed === '') {
			li++;
			continue;
		}
		if (trimmed.startsWith('<!--')) {
			li = skipComment(li);
			continue;
		}
		if (startsTag(trimmed, 'script')) {
			const captured = captureTag('script', li);
			if (!captured) return { script, style, entities, errors, source };
			if (script) {
				errors.push({
					code: 'duplicate-script',
					message: 'Only one <script> block is allowed.',
					span: captured.block.span,
				});
			} else if (entities.length > 0 || style) {
				errors.push({
					code: 'script-position',
					message: '<script> must be at the top of the file, before any entity.',
					span: captured.block.span,
				});
			} else {
				script = captured.block;
			}
			li = captured.nextLi;
			continue;
		}
		if (startsTag(trimmed, 'style')) {
			const captured = captureTag('style', li);
			if (!captured) return { script, style, entities, errors, source };
			if (style) {
				errors.push({
					code: 'duplicate-style',
					message: 'Only one <style> block is allowed.',
					span: captured.block.span,
				});
			} else {
				style = captured.block;
			}
			li = captured.nextLi;
			continue;
		}
		const token = tagToken(trimmed);
		if (token && !token.closer && isEntityKind(token.name)) {
			if (style) {
				errors.push({
					code: 'style-position',
					message: '<style> must be at the bottom of the file, after all entities.',
					span: { start: line.start, end: line.end },
				});
			}
			const opener = scanOpener(li, token.name.length);
			if (!opener) return { script, style, entities, errors, source };
			const entity: Entity = {
				kind: token.name,
				attrs: opener.attrs,
				blocks: [],
				script: null,
				style: null,
				body: '',
				bodySpan: { start: opener.openerSpan.end, end: opener.openerSpan.end },
				openerSpan: opener.openerSpan,
				span: { start: opener.openerSpan.start, end: opener.openerSpan.end },
			};
			entities.push(entity);
			if (token.name === 'SHOWCASE' || token.name === 'PATTERNS') {
				li = scanShowcaseBody(opener.nextLi, entity);
			} else if (token.name === 'DOC') {
				li = scanDocBody(opener.nextLi, entity);
			} else {
				const captured = captureBody(opener.nextLi, `[/${token.name}]`);
				if (!captured) {
					errors.push({
						code: 'unclosed-block',
						message: `Missing [/${token.name}].`,
						span: opener.openerSpan,
					});
					entity.body = source.slice(
						opener.nextLi < lines.length ? lines[opener.nextLi].start : source.length,
					);
					entity.span.end = source.length;
					return { script, style, entities, errors, source };
				}
				const sub = scanSubBlockBody(opener.nextLi, captured.nextLi - 1, token.name, 'entity');
				entity.script = sub.script;
				entity.style = sub.style;
				// The body is the markup between the entity script and style — the
				// Svelte fragment the page renders.
				entity.body = source.slice(sub.markupSpan.start, sub.markupSpan.end);
				entity.bodySpan = sub.markupSpan;
				entity.span.end = captured.closerSpan.end;
				li = captured.nextLi;
			}
			continue;
		}
		const span = { start: line.start + line.text.indexOf(trimmed[0]), end: line.end };
		if (token && !token.closer && isEntityKind(token.name.toUpperCase())) {
			errors.push({
				code: 'casing',
				message: `Entity tags are uppercase: [${token.name.toUpperCase()}].`,
				span,
			});
			li++;
			continue;
		}
		if (token && !token.closer && subBlockKindOf(token.name)) {
			errors.push({
				code: 'block-outside-entity',
				message:
					token.name === 'example'
						? '[example] is only valid inside a [SHOWCASE] or [DOC] entity.'
						: `[${token.name}] is only valid inside a [SHOWCASE] entity.`,
				span,
			});
			li++;
			continue;
		}
		if (token && token.closer) {
			errors.push({
				code: 'stray-closer',
				message: `Unexpected closer [/${token.name}].`,
				span,
			});
			li++;
			continue;
		}
		errors.push({
			code: 'text-outside-blocks',
			message: 'Text must be inside an entity block.',
			span,
		});
		li++;
	}

	return { script, style, entities, errors, source };
}

/** Convert an offset to a 0-based line/column pair (for editors/CLI output). */
export function offsetToPosition(source: string, offset: number): { line: number; column: number } {
	let line = 0;
	let lineStart = 0;
	for (let i = 0; i < offset && i < source.length; i++) {
		if (source[i] === '\n') {
			line++;
			lineStart = i + 1;
		}
	}
	return { line, column: offset - lineStart };
}
