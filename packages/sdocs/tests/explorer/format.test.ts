import { describe, it, expect } from 'vitest';
import { splitUnion, typeParts, typeClass } from '../../src/lib/explorer/views/format.js';

describe('splitUnion', () => {
	it('splits a top-level union', () => {
		expect(splitUnion('number | string')).toEqual(['number', 'string']);
		expect(splitUnion("'sm' | 'md' | 'lg'")).toEqual(["'sm'", "'md'", "'lg'"]);
	});

	it('leaves a non-union whole', () => {
		expect(splitUnion('string')).toEqual(['string']);
		expect(splitUnion('Snippet<[Row]>')).toEqual(['Snippet<[Row]>']);
	});

	it('does not split a `|` nested in generics, objects, or arrays', () => {
		expect(splitUnion('Array<A | B>')).toEqual(['Array<A | B>']);
		expect(splitUnion('{ a: 1 } | { b: 2 }')).toEqual(['{ a: 1 }', '{ b: 2 }']);
		expect(splitUnion('Record<string, A | B> | null')).toEqual(['Record<string, A | B>', 'null']);
	});

	it('handles arrow types without mistaking `=>` for a generic close', () => {
		expect(splitUnion('(() => void) | string')).toEqual(['(() => void)', 'string']);
		expect(splitUnion('(x: number) => void')).toEqual(['(x: number) => void']);
	});

	it('ignores a `|` inside a string literal', () => {
		expect(splitUnion("'a|b' | 'c'")).toEqual(["'a|b'", "'c'"]);
	});
});

describe('typeParts + typeClass', () => {
	it('colors each member of a mixed union on its own', () => {
		const parts = typeParts('number | string');
		expect(parts).toEqual(['number', 'string']);
		expect(parts.map(typeClass)).toEqual(['number', 'string']);
	});

	it('keeps literal-union members green (string class)', () => {
		expect(typeParts("'xs' | 'sm' | 'md'").map(typeClass)).toEqual(['string', 'string', 'string']);
	});

	it('a non-union stays a single classified chip', () => {
		expect(typeParts('boolean')).toEqual(['boolean']);
		expect(typeClass('boolean')).toBe('boolean');
		expect(typeParts('(x) => void')).toEqual(['(x) => void']);
		expect(typeClass('(x) => void')).toBe('function');
	});

	it('classifies mixed members with base types and void', () => {
		expect(typeParts('string | undefined').map(typeClass)).toEqual(['string', 'void']);
	});
});
