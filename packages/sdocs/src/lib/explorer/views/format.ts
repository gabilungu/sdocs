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

/** Split a clean union type into its members; everything else stays whole */
export function typeParts(value: unknown): string[] {
	const v = normalizeType(value);
	if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(v) || /^\d+(\.\d+)?(\s*\|\s*\d+(\.\d+)?)+$/.test(v)) {
		return v.split('|').map((part) => part.trim());
	}
	return [v];
}
