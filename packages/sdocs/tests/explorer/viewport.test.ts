/**
 * The mobile breakpoint lives in two places by necessity: `NARROW_MAX`, which
 * the Explorer reads to decide what markup to render at all, and the
 * `@media (max-width: …)` blocks, which have to be plain CSS so a prerendered
 * page paints narrow before hydration runs. Nothing enforces that pairing at
 * runtime — a stylesheet a hair wider than the module would leave the drawer
 * parked off-canvas with no burger to open it. So enforce it here.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NARROW_MAX } from '../../src/lib/explorer/viewport.svelte.js';
import { capSidePadding } from '../../src/lib/explorer/viewport.svelte.js';

const LIB = resolve(__dirname, '../../src/lib');

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return walk(path);
		return name.endsWith('.svelte') || name.endsWith('.css') ? [path] : [];
	});
}

describe('narrow breakpoint', () => {
	it('is the only max-width in the package', () => {
		const offenders: string[] = [];
		for (const file of walk(LIB)) {
			const source = readFileSync(file, 'utf8');
			for (const [, px] of source.matchAll(/@media\s*\(\s*max-width:\s*(\d+)px/g)) {
				if (Number(px) !== NARROW_MAX) {
					offenders.push(`${file.slice(LIB.length + 1)}: ${px}px`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('has at least one stylesheet using it', () => {
		const found = walk(LIB).some((file) =>
			new RegExp(`@media\\s*\\(\\s*max-width:\\s*${NARROW_MAX}px`).test(
				readFileSync(file, 'utf8'),
			),
		);
		expect(found).toBe(true);
	});
});

describe('capSidePadding', () => {
	it('caps only the horizontal slots of each shorthand', () => {
		expect(capSidePadding('24px')).toBe('24px min(24px, 16px)');
		expect(capSidePadding('24px 32px')).toBe('24px min(32px, 16px)');
		expect(capSidePadding('8px 32px 24px')).toBe('8px min(32px, 16px) 24px');
		expect(capSidePadding('8px 32px 24px 40px')).toBe(
			'8px min(32px, 16px) 24px min(40px, 16px)',
		);
	});

	it('leaves zero alone — min(0, 16px) mixes a number with a length', () => {
		expect(capSidePadding('0')).toBe('0 0');
		expect(capSidePadding('24px 0')).toBe('24px 0');
	});

	it('passes through what it cannot safely parse', () => {
		expect(capSidePadding(undefined)).toBeUndefined();
		expect(capSidePadding('calc(1rem + 2px) 2rem')).toBe('calc(1rem + 2px) 2rem');
		expect(capSidePadding('var(--pad)')).toBe('var(--pad)');
	});
});
