/** Shared lightweight scanning of .sdoc source (no Svelte compiler dependency). */

export interface ScanState {
	depth: number;
	quote: string;
	escaped: boolean;
	comment: '' | 'line' | 'block';
}

export function newScanState(): ScanState {
	return { depth: 0, quote: '', escaped: false, comment: '' };
}

/** True while the scanner is in plain code (not in a string or comment). */
export function inCode(state: ScanState): boolean {
	return !state.quote && !state.comment && !state.escaped;
}

/** Process text[i] (and possibly text[i+1]); returns how many chars were consumed. */
export function step(text: string, i: number, state: ScanState): number {
	const ch = text[i];
	if (state.escaped) {
		state.escaped = false;
		return 1;
	}
	if (state.comment === 'line') {
		if (ch === '\n') state.comment = '';
		return 1;
	}
	if (state.comment === 'block') {
		if (ch === '*' && text[i + 1] === '/') {
			state.comment = '';
			return 2;
		}
		return 1;
	}
	if (state.quote) {
		if (ch === '\\') state.escaped = true;
		else if (ch === state.quote) state.quote = '';
		return 1;
	}
	if (ch === '/' && text[i + 1] === '/') {
		state.comment = 'line';
		return 2;
	}
	if (ch === '/' && text[i + 1] === '*') {
		state.comment = 'block';
		return 2;
	}
	if (ch === "'" || ch === '"' || ch === '`') state.quote = ch;
	else if (ch === '{') state.depth++;
	else if (ch === '}') state.depth--;
	return 1;
}

export interface MetaObject {
	/** Offset of `export const meta` */
	declStart: number;
	/** Offset of the object literal's opening brace */
	braceOpen: number;
	/** Offset of the closing brace (text.length if unterminated) */
	objEnd: number;
	/**
	 * The object source with everything that is not top-level code (nested
	 * objects, strings, comments) masked to spaces. Newlines are preserved,
	 * so line-anchored regexes work and offsets map 1:1 to the source.
	 */
	topLevel: string;
}

/** Find the last `export const meta = { ... }` starting at or before maxDeclStart. */
export function findMetaObject(text: string, maxDeclStart = Infinity): MetaObject | null {
	let declStart = -1;
	for (const match of text.matchAll(/^[ \t]*export\s+const\s+meta\b/gm)) {
		if (match.index > maxDeclStart) break;
		declStart = match.index;
	}
	if (declStart === -1) return null;

	// Skip a possible type annotation: the object literal's `{` is the first
	// one after the depth-0 `=` (outside strings/comments).
	const state = newScanState();
	let braceOpen = -1;
	let eqSeen = false;
	let i = declStart;
	while (i < text.length && braceOpen === -1) {
		const ch = text[i];
		if (inCode(state) && state.depth === 0) {
			if (ch === '=') eqSeen = true;
			else if (eqSeen && ch === '{') braceOpen = i;
		}
		i += step(text, i, state);
	}
	if (braceOpen === -1) return null;

	// Walk the object, masking non-top-level content.
	const mask = newScanState();
	mask.depth = 1; // state after consuming the opening brace
	let topLevel = text[braceOpen];
	let objEnd = text.length;
	let j = braceOpen + 1;
	while (j < text.length) {
		const wasTopLevelCode = mask.depth === 1 && inCode(mask);
		const consumed = step(text, j, mask);
		if (mask.depth === 0) {
			objEnd = j;
			break;
		}
		for (let k = j; k < j + consumed; k++) {
			topLevel += text[k] === '\n' ? '\n' : wasTopLevelCode ? text[k] : ' ';
		}
		j += consumed;
	}
	return { declStart, braceOpen, objEnd, topLevel };
}

/** Runtime-value identifiers imported in the file (type-only imports excluded). */
export function importedIdentifiers(text: string): Set<string> {
	const names = new Set<string>();
	for (const match of text.matchAll(/^\s*import\s+([^'"]+?)\s+from\s+['"]/gm)) {
		let clause = match[1].trim();
		if (/^type\b/.test(clause)) continue; // import type ... — no runtime value
		const named = /\{([^}]*)\}/.exec(clause);
		if (named) {
			for (const spec of named[1].split(',')) {
				const parts = spec.trim();
				if (!parts || /^type\b/.test(parts)) continue;
				const alias = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(parts);
				names.add(alias ? alias[1] : parts.split(/\s+/)[0]);
			}
			clause = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
		}
		const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause);
		if (ns) names.add(ns[1]);
		const def = /^([A-Za-z_$][\w$]*)/.exec(clause);
		if (def) names.add(def[1]);
	}
	return names;
}

export interface TopLevelSnippet {
	name: string;
	/** Offset of the name within the source */
	nameOffset: number;
}

/** Top-level {#snippet Name(...)} blocks in the markup (outside script/style). */
export function topLevelSnippets(text: string): TopLevelSnippet[] {
	// Blank out script/style contents but keep offsets stable.
	const markup = text.replace(
		/<(script|style)[^>]*>[\s\S]*?<\/\1>/g,
		(m) => m.replace(/[^\n]/g, ' '),
	);
	const snippets: TopLevelSnippet[] = [];
	let depth = 0;
	const token = /\{#snippet\s+([\w$]+)|\{\/snippet\}/g;
	let match;
	while ((match = token.exec(markup))) {
		if (match[1]) {
			if (depth === 0) {
				snippets.push({
					name: match[1],
					nameOffset: match.index + match[0].length - match[1].length,
				});
			}
			depth++;
		} else {
			depth = Math.max(0, depth - 1);
		}
	}
	return snippets;
}
