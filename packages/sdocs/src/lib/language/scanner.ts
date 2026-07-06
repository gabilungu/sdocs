/**
 * Syntactic scanner for v2 .sdoc files.
 *
 * A .sdoc file is: optional <script> at the top, entity blocks in the
 * middle ([SHOWCASE] / [PAGE] / [LAYOUT], with lowercase sub-blocks [preview] /
 * [example] inside [SHOWCASE] and [example] inside [PAGE]), optional <style>
 * at the bottom.
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

export interface Span {
	start: number;
	end: number;
}

export type EntityKind = 'SHOWCASE' | 'PAGE' | 'LAYOUT';
export type SubBlockKind = 'preview' | 'example';

export const ENTITY_KINDS: readonly EntityKind[] = ['SHOWCASE', 'PAGE', 'LAYOUT'];
export const SUB_BLOCK_KINDS: readonly SubBlockKind[] = ['preview', 'example'];

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
	attrs: Attrs;
	/** Raw body between the opener line and the closer line */
	body: string;
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

export interface Entity {
	kind: EntityKind;
	attrs: Attrs;
	/** SHOWCASE: preview/example sub-blocks. PAGE: example sub-blocks. LAYOUT: always empty. */
	blocks: SubBlock[];
	/** PAGE/LAYOUT: the raw body (for PAGE it includes any [example] blocks,
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

/** Scan an opener's attributes starting right after `[KIND`. Handles
 * multi-line openers and quote/brace nesting. Returns the offset just past
 * the closing ']' or reports an error and returns -1. */
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
			errors.push({
				code: 'attr-syntax',
				message: `Unexpected character '${ch}' in block opener.`,
				span: { start: i, end: i + 1 },
			});
			return -1;
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
			const valueStart = i + 1;
			const close = source.indexOf('"', valueStart);
			if (close === -1) {
				errors.push({
					code: 'attr-syntax',
					message: `Unterminated string value for attribute "${name}".`,
					span: { start: nameStart, end: source.length },
				});
				return -1;
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

/** Parse a `[name` / `[/name` token at the start of a trimmed line. */
function tagToken(trimmed: string): { name: string; closer: boolean } | null {
	const m = trimmed.match(/^\[(\/?)([A-Za-z][A-Za-z0-9_-]*)/);
	if (!m) return null;
	return { name: m[2], closer: m[1] === '/' };
}

function isEntityKind(name: string): name is EntityKind {
	return (ENTITY_KINDS as readonly string[]).includes(name);
}

function isSubBlockKind(name: string): name is SubBlockKind {
	return (SUB_BLOCK_KINDS as readonly string[]).includes(name);
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
		const openEnd = source.indexOf('>', openStart);
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

	/** Scan the inside of a [SHOWCASE] entity until its closer. */
	function scanShowcaseBody(startLi: number, entity: Entity): number {
		let i = startLi;
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
			const token = tagToken(trimmed);
			if (token && token.closer && token.name === 'SHOWCASE' && trimmed === '[/SHOWCASE]') {
				const tagStart = line.start + line.text.indexOf('[/SHOWCASE]');
				entity.span.end = tagStart + '[/SHOWCASE]'.length;
				return i + 1;
			}
			if (token && !token.closer && isSubBlockKind(token.name)) {
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
				entity.blocks.push({
					kind: token.name,
					attrs: opener.attrs,
					body: captured.body,
					bodySpan: captured.bodySpan,
					openerSpan: opener.openerSpan,
					span: { start: opener.openerSpan.start, end: captured.closerSpan.end },
				});
				i = captured.nextLi;
				continue;
			}
			const span = { start: line.start + line.text.indexOf(trimmed[0]), end: line.end };
			if (token && isSubBlockKind(token.name.toLowerCase() as SubBlockKind) && !token.closer) {
				errors.push({
					code: 'casing',
					message: `Sub-block tags are lowercase: [${token.name.toLowerCase()}].`,
					span,
				});
				i++;
				continue;
			}
			if (token && !token.closer && isEntityKind(token.name)) {
				errors.push({
					code: 'unclosed-block',
					message: `Missing [/SHOWCASE] before the next entity.`,
					span,
				});
				entity.span.end = line.start;
				return i; // recover: let the outer loop re-read this line
			}
			if (token) {
				errors.push({
					code: token.closer ? 'stray-closer' : 'unknown-tag',
					message: token.closer
						? `Unexpected closer [/${token.name}] inside [SHOWCASE].`
						: `Unknown block [${token.name}] inside [SHOWCASE] — expected [preview] or [example].`,
					span,
				});
				i++;
				continue;
			}
			errors.push({
				code: 'text-outside-blocks',
				message: 'Text inside [SHOWCASE] must be inside a [preview] or [example] block.',
				span,
			});
			i++;
		}
		errors.push({
			code: 'unclosed-block',
			message: 'Missing [/SHOWCASE].',
			span: entity.openerSpan,
		});
		entity.span.end = source.length;
		return lines.length;
	}

	/** Scan the inside of a [PAGE] entity until its closer: prose lines are
	 * body text, [example] openers capture sub-blocks. Lines inside markdown
	 * code fences are always prose, so a fence may show block syntax without
	 * escaping. The body keeps the raw text of the whole range — example
	 * blocks included — so consumers can splice by span. */
	function scanPageBody(startLi: number, entity: Entity): number {
		const bodyStart = startLi < lines.length ? lines[startLi].start : source.length;
		let bodyEnd = bodyStart;
		let inFence = false;
		let i = startLi;
		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.text.trim();
			if (/^(`{3,}|~{3,})/.test(trimmed)) {
				inFence = !inFence;
				bodyEnd = line.end;
				i++;
				continue;
			}
			if (inFence) {
				if (trimmed !== '') bodyEnd = line.end;
				i++;
				continue;
			}
			if (trimmed === '[/PAGE]') {
				const tagStart = line.start + line.text.indexOf('[/PAGE]');
				entity.body = source.slice(bodyStart, Math.max(bodyStart, bodyEnd));
				entity.bodySpan = { start: bodyStart, end: Math.max(bodyStart, bodyEnd) };
				entity.span.end = tagStart + '[/PAGE]'.length;
				return i + 1;
			}
			const token = tagToken(trimmed);
			if (token && !token.closer && token.name === 'example') {
				const opener = scanOpener(i, token.name.length);
				if (!opener) return lines.length;
				const captured = captureBody(opener.nextLi, '[/example]');
				if (!captured) {
					errors.push({
						code: 'unclosed-block',
						message: 'Missing [/example].',
						span: opener.openerSpan,
					});
					return lines.length;
				}
				entity.blocks.push({
					kind: 'example',
					attrs: opener.attrs,
					body: captured.body,
					bodySpan: captured.bodySpan,
					openerSpan: opener.openerSpan,
					span: { start: opener.openerSpan.start, end: captured.closerSpan.end },
				});
				bodyEnd = captured.closerSpan.end;
				i = captured.nextLi;
				continue;
			}
			if (token && !token.closer && token.name === 'preview') {
				errors.push({
					code: 'unknown-tag',
					message: '[preview] is only valid inside [SHOWCASE] — pages showcase with [example].',
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
			message: 'Missing [/PAGE].',
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
		if (trimmed.startsWith('<script')) {
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
		if (trimmed.startsWith('<style')) {
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
				body: '',
				bodySpan: { start: opener.openerSpan.end, end: opener.openerSpan.end },
				openerSpan: opener.openerSpan,
				span: { start: opener.openerSpan.start, end: opener.openerSpan.end },
			};
			entities.push(entity);
			if (token.name === 'SHOWCASE') {
				li = scanShowcaseBody(opener.nextLi, entity);
			} else if (token.name === 'PAGE') {
				li = scanPageBody(opener.nextLi, entity);
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
				entity.body = captured.body;
				entity.bodySpan = captured.bodySpan;
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
		if (token && !token.closer && isSubBlockKind(token.name)) {
			errors.push({
				code: 'block-outside-entity',
				message:
					token.name === 'example'
						? '[example] is only valid inside a [SHOWCASE] or [PAGE] entity.'
						: '[preview] is only valid inside a [SHOWCASE] entity.',
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
