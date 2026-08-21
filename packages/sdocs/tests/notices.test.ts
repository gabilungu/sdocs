/**
 * Everything the package redistributes has to be attributed.
 *
 * The two OFL webfonts shipped for months with no notice at all — the icons
 * had one, and the fonts were simply forgotten, which is what happens when the
 * list is maintained by remembering. The OFL is explicit that the copyright
 * notice and licence travel with the font files.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = resolve(__dirname, '..');
const notice = readFileSync(resolve(pkg, 'NOTICE.md'), 'utf-8');

describe('NOTICE.md', () => {
	it('names every font family the package ships', () => {
		const dir = resolve(pkg, 'src/lib/ui/styles/fonts');
		// `figtree-latin.woff2` → `figtree`; the family is the leading segment.
		const families = new Set(
			readdirSync(dir)
				.filter((f) => f.endsWith('.woff2'))
				.map((f) => f.split('-')[0]),
		);
		expect(families.size).toBeGreaterThan(0);
		for (const family of families) {
			expect(notice.toLowerCase(), family).toContain(family);
		}
	});

	it('reproduces the OFL, DEFINITIONS included', () => {
		// The whole licence, not a summary and not a reflow: condition 2 asks
		// for "this license", and the definitions are part of it.
		for (const section of [
			'SIL OPEN FONT LICENSE Version 1.1',
			'PREAMBLE',
			'DEFINITIONS',
			'PERMISSION & CONDITIONS',
			'TERMINATION',
			'DISCLAIMER',
		]) {
			expect(notice, section).toContain(section);
		}
	});

	it('is published', () => {
		const files = JSON.parse(readFileSync(resolve(pkg, 'package.json'), 'utf-8')).files as string[];
		expect(files).toContain('NOTICE.md');
	});
});
