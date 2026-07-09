/** Drop `import('module').` qualifiers — JSDoc types carry them, TS ones don't */
function normalizeType(value: unknown): string {
	return String(value)
		.trim()
		.replace(/import\((['"])[^'"]*\1\)\./g, '');
}

/** Classify a type string for color coding (conventions, not a formal standard) */
export function typeClass(value: unknown): string {
	const v = normalizeType(value);
	if (v === 'string' || /^'[^']*'(\s*\|\s*'[^']*')*$/.test(v)) return 'string';
	if (v === 'number' || /^\d+(\.\d+)?(\s*\|\s*\d+(\.\d+)?)*$/.test(v)) return 'number';
	if (v === 'boolean') return 'boolean';
	if (v.includes('=>')) return 'function';
	if (v.startsWith('Snippet')) return 'snippet';
	if (v === 'color') return 'color';
	if (v === 'dimension') return 'dimension';
	if (v === 'void' || v === 'undefined' || v === 'null') return 'void';
	return 'other';
}

/** Classify a literal value for color coding (defaults, current state) */
export function valueClass(value: unknown): string {
	const v = String(value).trim();
	if (v === 'true' || v === 'false') return 'boolean';
	if (/^-?\d+(\.\d+)?$/.test(v)) return 'number';
	if (/^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|pt)$/.test(v)) return 'dimension';
	if (/^(#[0-9a-fA-F]{3,8}$|hsla?\(|rgba?\(|oklch\(|oklab\()/.test(v)) return 'color';
	if (v.startsWith('{') || v.startsWith('[')) return 'other';
	return 'string';
}

/**
 * Split a union type into its top-level members, respecting quotes and
 * nesting — parens, brackets, braces, and generics — so a `|` inside
 * `Array<A | B>`, `{ a: 1 } | { b: 2 }`, or `(x) => A | B` is not a split
 * point. The `>` of an arrow `=>` is not treated as a generic close. A
 * non-union returns a single-element array.
 */
export function splitUnion(value: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let current = '';
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (quote) {
			current += c;
			if (c === quote) quote = null;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			quote = c;
			current += c;
			continue;
		}
		if (c === '=' && value[i + 1] === '>') {
			current += '=>';
			i++;
			continue;
		}
		if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
		else if (c === ')' || c === ']' || c === '}' || c === '>') depth = Math.max(0, depth - 1);
		else if (c === '|' && depth === 0) {
			// Skip empty members so a leading, trailing, or doubled `|` — valid
			// in a multi-line union — doesn't produce a blank chip.
			if (current.trim()) parts.push(current.trim());
			current = '';
			continue;
		}
		current += c;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

/** Split a type into member chips: each top-level union member is its own
 * chip, classified individually (so `number | string` colors each part). A
 * non-union stays a single chip. */
export function typeParts(value: unknown): string[] {
	const v = normalizeType(value);
	const parts = splitUnion(v);
	return parts.length > 1 ? parts : [v];
}
