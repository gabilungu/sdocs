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
	// Snippet before function: a `Snippet<[{ close: () => void }]>` has an
	// arrow inside its parameter type but is still a snippet, not a callback.
	if (v.startsWith('Snippet')) return 'snippet';
	if (v.includes('=>')) return 'function';
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

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Inline markdown for description prose — `` `code` ``, `**bold**`,
 * `*italics*` — so a JSDoc or showcase description reads styled, not as raw
 * backticks. Input is HTML-escaped first (descriptions legitimately mention
 * tags like `<p>`), and emphasis never runs inside a code span. */
export function renderInlineMarkdown(text: string): string {
	const emphasize = (s: string) =>
		s
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
	// Code spans are literal — split them out before emphasis runs.
	return text
		.split(/(`[^`]+`)/)
		.map((part) =>
			part.startsWith('`') && part.endsWith('`') && part.length > 2
				? `<code>${escapeHtml(part.slice(1, -1))}</code>`
				: emphasize(escapeHtml(part)),
		)
		.join('');
}

/** Parse a union of string or number literals ("'sm' | 'md'", "1 | 2") into
 * select options — across line breaks and leading pipes, the way Prettier
 * wraps long unions. Mixed or non-literal members return null: no select can
 * represent them. */
export function unionOptions(value: unknown): string[] | null {
	if (value == null) return null;
	const v = normalizeType(value);
	if (!v.includes('|')) return null;
	const parts = splitUnion(v);
	if (parts.length < 2) return null;
	const values: string[] = [];
	let allStrings = true;
	let allNumbers = true;
	for (const part of parts) {
		// Quoted string: 'value' or "value"
		const strMatch = part.match(/^['"](.+)['"]$/);
		if (strMatch) {
			values.push(strMatch[1]);
			allNumbers = false;
			continue;
		}
		// Bare number: 1, 2, 3
		if (/^\d+(\.\d+)?$/.test(part)) {
			values.push(part);
			allStrings = false;
			continue;
		}
		// Mixed or unsupported (e.g. 'medium' | number) → null
		return null;
	}
	if (values.length > 0 && (allStrings || allNumbers)) return values;
	return null;
}
