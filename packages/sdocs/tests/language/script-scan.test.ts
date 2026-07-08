import { describe, expect, it } from 'vitest';
import { declaredBindings, scrubScriptText } from '../../src/lib/language/script-scan.js';

describe('scrubScriptText', () => {
	it('blanks comments and string contents, preserving offsets and newlines', () => {
		const src = "const a = 'hi';\n// note\nlet b = 2; /* block */ var c = 3;";
		const out = scrubScriptText(src);
		expect(out.length).toBe(src.length);
		expect(out.split('\n').length).toBe(src.split('\n').length);
		expect(out).toContain('const a =');
		expect(out).toContain('let b = 2;');
		expect(out).toContain('var c = 3;');
		expect(out).not.toContain('hi');
		expect(out).not.toContain('note');
		expect(out).not.toContain('block');
	});

	it('keeps string delimiters so tokens stay visible', () => {
		expect(scrubScriptText("'ab'")).toBe("'  '");
		expect(scrubScriptText('"a"')).toBe('" "');
		expect(scrubScriptText('`ab`')).toBe('`  `');
	});

	it('blanks template literal contents including interpolations and inner newlines', () => {
		const src = "const t = `x ${call('arg')} y\nimport Fake from './F.svelte';\n`; let z = 1;";
		const out = scrubScriptText(src);
		expect(out.length).toBe(src.length);
		expect(out).not.toContain('call');
		expect(out).not.toContain('import Fake');
		expect(out).toContain('let z = 1;');
	});

	it('handles escaped quotes inside strings', () => {
		const src = "const s = 'it\\'s'; let after = 1;";
		expect(scrubScriptText(src)).toContain('let after = 1;');
	});

	it('an unterminated line string stops at the line break', () => {
		const src = "const s = 'oops\nlet b = 1;";
		expect(scrubScriptText(src)).toContain('let b = 1;');
	});

	it('a comment marker inside a string does not start a comment', () => {
		const src = "const url = 'http://x'; let after = 1;";
		expect(scrubScriptText(src)).toContain('let after = 1;');
	});
});

describe('declaredBindings', () => {
	const names = (src: string) => declaredBindings(src).map((b) => b.name);

	it('finds plain declarations for every keyword', () => {
		expect(names('const a = 1; let b; var c; function d() {} class E {}')).toEqual([
			'a',
			'b',
			'c',
			'd',
			'E',
		]);
	});

	it('finds object destructuring, renames, defaults, and rest', () => {
		expect(names('const { args } = o;')).toEqual(['args']);
		expect(names('const { x: args } = o;')).toEqual(['args']);
		expect(names('const { args = {} } = o;')).toEqual(['args']);
		expect(names('let { ...args } = o;')).toEqual(['args']);
		expect(names('const { a, b: { c }, ...rest } = o;')).toEqual(['a', 'c', 'rest']);
	});

	it('finds array destructuring, holes, and nesting', () => {
		expect(names('const [args] = xs;')).toEqual(['args']);
		expect(names('let [first, , { deep: alias = 1 }, ...more] = xs;')).toEqual([
			'first',
			'alias',
			'more',
		]);
	});

	it('a name in a destructuring default is a use, not a binding', () => {
		expect(names('const { x = args } = o;')).toEqual(['x']);
		expect(names('const [y = args.first] = o;')).toEqual(['y']);
	});

	it('skips quoted and computed keys', () => {
		expect(names("const { 'data-x': dx, [key]: kv } = o;")).toEqual(['dx', 'kv']);
	});

	it('ignores declaration-shaped text in comments and strings', () => {
		expect(names("// let args = 1\nconst s = 'let args = 2';")).toEqual(['s']);
		expect(names('const t = `\nconst args = 1;\n`;')).toEqual(['t']);
	});

	it('reports the offsets of the bound name', () => {
		expect(declaredBindings('let  args = 1;')[0]).toEqual({ name: 'args', start: 5, end: 9 });
	});
});
