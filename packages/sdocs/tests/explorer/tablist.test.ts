/**
 * The tablist keyboard pattern.
 *
 * A `role="tablist"` that does not answer the arrow keys is a tablist only to
 * a screen reader, which announces "tab 2 of 5" and then cannot reach tab 3.
 * The rules have edge cases in both directions — wrapping past either end —
 * and the handler they live in needs a whole document, component metadata and
 * a live iframe to mount, so they are checked here instead.
 */

import { describe, expect, it } from 'vitest';
import { nextTabIndex } from '../../src/lib/explorer/views/tablist.js';

describe('nextTabIndex', () => {
	it('moves right and left', () => {
		expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
		expect(nextTabIndex('ArrowLeft', 2, 3)).toBe(1);
	});

	it('wraps at both ends', () => {
		expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
		// The one that goes negative if you write it as `current - 1`.
		expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
	});

	it('jumps to the ends', () => {
		expect(nextTabIndex('Home', 2, 3)).toBe(0);
		expect(nextTabIndex('End', 0, 3)).toBe(2);
	});

	it('ignores every other key, so typing still reaches the page', () => {
		for (const key of ['a', 'Enter', 'Tab', ' ', 'ArrowUp', 'ArrowDown', 'Escape']) {
			expect(nextTabIndex(key, 0, 3), key).toBeNull();
		}
	});

	it('does nothing with one tab or none', () => {
		// A single-component showcase still renders its tab strip; there is
		// just nowhere for an arrow to go.
		expect(nextTabIndex('ArrowRight', 0, 1)).toBeNull();
		expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
	});

	it('stays in range from any starting point', () => {
		for (let count = 2; count <= 6; count++) {
			for (let from = 0; from < count; from++) {
				for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
					const to = nextTabIndex(key, from, count);
					expect(to, `${key} from ${from} of ${count}`).not.toBeNull();
					expect(to).toBeGreaterThanOrEqual(0);
					expect(to).toBeLessThan(count);
				}
			}
		}
	});
});
