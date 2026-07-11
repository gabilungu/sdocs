import { describe, expect, it } from 'vitest';
import { globBase } from '../../src/lib/server/discovery.js';

describe('globBase (recursive watch roots for doc discovery)', () => {
	it('returns the static prefix of a recursive glob', () => {
		expect(globBase('/proj/src/**/*.sdoc')).toBe('/proj/src');
		expect(globBase('/proj/docs/*.sdoc')).toBe('/proj/docs');
	});

	it('stops at the first segment containing glob magic', () => {
		expect(globBase('/proj/src/comp-*/docs/*.sdoc')).toBe('/proj/src');
		expect(globBase('/proj/{a,b}/*.sdoc')).toBe('/proj');
		expect(globBase('/proj/[ab]/*.sdoc')).toBe('/proj');
	});

	it('returns the directory of a literal file path', () => {
		expect(globBase('/proj/docs/intro.sdoc')).toBe('/proj/docs');
	});

	it('falls back to the root or cwd when no static prefix exists', () => {
		expect(globBase('/**/*.sdoc')).toBe('/');
		expect(globBase('*.sdoc')).toBe('.');
		expect(globBase('**/*.sdoc')).toBe('.');
	});
});
