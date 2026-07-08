/**
 * Offset-preserving text scans over `<script>` content, shared by the parser
 * (import/reserved-name diagnostics) and the server-side snippet compiler
 * (import rewriting, import extraction). Everything here works on plain
 * strings — no filesystem, no node APIs — so it is safe in editor tooling.
 */

/**
 * Blank out the contents of comments, string literals, and template literals
 * (offset- and newline-preserving), so import-shaped or declaration-shaped
 * text inside them never matches downstream regexes. String and template
 * delimiters are kept; template `${…}` interpolations are blanked with the
 * rest of the literal — an import statement can't legally live inside one.
 * Pragmatic by design: regex literals are not lexed, so a quote inside one
 * (`/['"]/`) can over-blank the code that follows until the next quote.
 */
export function scrubScriptText(source: string): string {
	let out = '';
	let i = 0;
	const n = source.length;
	const blank = (from: number, to: number) => {
		out += source.slice(from, to).replace(/[^\n]/g, ' ');
	};
	while (i < n) {
		const c = source[i];
		const next = source[i + 1];
		if (c === '/' && next === '/') {
			let end = source.indexOf('\n', i + 2);
			if (end === -1) end = n;
			blank(i, end);
			i = end;
		} else if (c === '/' && next === '*') {
			const close = source.indexOf('*/', i + 2);
			const end = close === -1 ? n : close + 2;
			blank(i, end);
			i = end;
		} else if (c === "'" || c === '"' || c === '`') {
			let j = i + 1;
			while (j < n) {
				if (source[j] === '\\') {
					j += 2;
					continue;
				}
				if (source[j] === c) break;
				// An unterminated ' or " string ends at the line break.
				if (c !== '`' && source[j] === '\n') break;
				j++;
			}
			out += c;
			blank(i + 1, Math.min(j, n));
			if (j < n && source[j] === c) {
				out += c;
				i = j + 1;
			} else {
				i = Math.min(j, n);
			}
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

/** A name bound by a declaration, with its offsets in the source. */
export interface DeclaredBinding {
	name: string;
	start: number;
	end: number;
}

const IDENT_AT = /[A-Za-z_$][\w$]*/y;

function skipWs(src: string, i: number): number {
	while (i < src.length && /\s/.test(src[i])) i++;
	return i;
}

/** Push the identifier at `i` (if any) as a binding; returns the next index. */
function takeIdent(src: string, i: number, out: DeclaredBinding[]): number {
	IDENT_AT.lastIndex = i;
	const id = IDENT_AT.exec(src);
	if (!id) return i + 1;
	out.push({ name: id[0], start: i, end: i + id[0].length });
	return i + id[0].length;
}

/** Skip a quoted key ('…' / "…") — contents are already blanked. */
function skipQuoted(src: string, i: number): number {
	const end = src.indexOf(src[i], i + 1);
	return end === -1 ? src.length : end + 1;
}

/** Skip a bracketed region ([computed] key), counting only its own bracket kind. */
function skipBalanced(src: string, i: number): number {
	const open = src[i];
	const close = open === '[' ? ']' : open === '{' ? '}' : ')';
	let depth = 0;
	while (i < src.length) {
		if (src[i] === open) depth++;
		else if (src[i] === close && --depth === 0) return i + 1;
		i++;
	}
	return i;
}

/** Skip a `= default` expression inside a pattern: to the next `,` at depth 0
 * or the pattern's own closer. */
function skipDefault(src: string, i: number): number {
	let depth = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === '(' || c === '[' || c === '{') depth++;
		else if (c === ')' || c === ']' || c === '}') {
			if (depth === 0) return i;
			depth--;
		} else if (depth === 0 && c === ',') return i;
		i++;
	}
	return i;
}

/** Collect the names a destructuring pattern binds ({ a, b: c = 1, ...rest },
 * [x, [y]], nested). Returns the index just past the pattern's closer. */
function patternBindings(src: string, i: number, out: DeclaredBinding[]): number {
	const isObject = src[i] === '{';
	const close = isObject ? '}' : ']';
	const n = src.length;
	i++;
	while (i < n) {
		i = skipWs(src, i);
		if (i >= n) return i;
		const c = src[i];
		if (c === close) return i + 1;
		if (c === ',') {
			i++;
			continue;
		}
		if (src.startsWith('...', i)) {
			i = skipWs(src, i + 3);
			if (src[i] === '{' || src[i] === '[') i = patternBindings(src, i, out);
			else i = takeIdent(src, i, out);
			continue;
		}
		if (isObject) {
			if (c === "'" || c === '"') {
				i = skipQuoted(src, i);
			} else if (c === '[') {
				i = skipBalanced(src, i);
			} else {
				IDENT_AT.lastIndex = i;
				const id = IDENT_AT.exec(src);
				if (!id) {
					i++;
					continue;
				}
				const after = skipWs(src, i + id[0].length);
				// Shorthand ({ args }) binds the key itself; `key: target`
				// binds the target, handled below.
				if (src[after] !== ':') out.push({ name: id[0], start: i, end: i + id[0].length });
				i = after;
			}
			i = skipWs(src, i);
			if (src[i] === ':') {
				i = skipWs(src, i + 1);
				if (src[i] === '{' || src[i] === '[') i = patternBindings(src, i, out);
				else i = takeIdent(src, i, out);
			}
		} else {
			if (c === '{' || c === '[') i = patternBindings(src, i, out);
			else i = takeIdent(src, i, out);
		}
		i = skipWs(src, i);
		if (src[i] === '=') i = skipDefault(src, i + 1);
	}
	return i;
}

const DECL_KEYWORD_RE = /\b(const|let|var|function|class)\b/g;

/**
 * The names declared by `const`/`let`/`var` (identifier or destructuring
 * pattern, including renames and rest) and by `function`/`class`, with their
 * offsets. Comments and string/template contents are scrubbed first, so
 * declaration-shaped text inside them never matches. Pragmatic scope: only
 * the first declarator of a multi-declarator list is seen, and declarations
 * nested in function bodies are reported like top-level ones (matching the
 * previous keyword-regex behavior).
 */
export function declaredBindings(source: string): DeclaredBinding[] {
	const src = scrubScriptText(source);
	const out: DeclaredBinding[] = [];
	DECL_KEYWORD_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = DECL_KEYWORD_RE.exec(src))) {
		let i = skipWs(src, m.index + m[0].length);
		if (m[1] === 'function' || m[1] === 'class') {
			if (src[i] === '*') i = skipWs(src, i + 1); // generator
			takeIdent(src, i, out);
			continue;
		}
		if (src[i] === '{' || src[i] === '[') patternBindings(src, i, out);
		else takeIdent(src, i, out);
	}
	return out;
}
