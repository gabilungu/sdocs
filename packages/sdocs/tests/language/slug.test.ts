/**
 * Titles become identifiers three times over — route segments, heading
 * anchors, entity addresses — and the three used to disagree.
 *
 * The entity slugger was ASCII-only, so every title in a script without an
 * ASCII form came out `untitled`: a site written in Russian had one
 * addressable entity and a duplicate-address error for every other, while its
 * routes resolved fine, because those ran through a different function.
 */

import { describe, expect, it } from 'vitest';
import { foldAccents, slugifySegment } from '../../src/lib/slug.js';
import { slugifyTitle } from '../../src/lib/language/parser.js';

describe('slugifySegment', () => {
	it('folds Latin diacritics to their base letter', () => {
		expect(slugifySegment('Setări')).toBe('setari');
		expect(slugifySegment('Łódź')).toBe('lodz');
		expect(slugifySegment('Verificări')).toBe('verificari');
		expect(slugifySegment('Straße')).toBe('strasse');
	});

	it('keeps letters from scripts that have no Latin base', () => {
		expect(slugifySegment('Кнопка')).toBe('кнопка');
		expect(slugifySegment('按钮')).toBe('按钮');
		expect(slugifySegment('زر')).toBe('زر');
	});

	it('leaves a dakuten alone — it is not an accent', () => {
		// Strip it and ボ (bo) becomes ホ (ho): a different sound, and a slug
		// that points at a page nobody was looking for.
		expect(slugifySegment('ボタン')).toBe('ボタン');
		expect(foldAccents('ボタン')).toBe('ボタン');
	});

	it('drops punctuation and joins on whitespace', () => {
		expect(slugifySegment('Getting Started!')).toBe('getting-started');
		expect(slugifySegment('Поле ввода')).toBe('поле-ввода');
	});

	it('falls back only when nothing usable is left', () => {
		expect(slugifySegment('!!!')).toBe('item');
	});
});

describe('slugifyTitle', () => {
	it('agrees with the route rule', () => {
		for (const title of ['Кнопка', '按钮', 'Setări', 'Button']) {
			expect(slugifyTitle(title)).toBe(slugifySegment(title));
		}
	});

	it('gives two non-Latin titles two different addresses', () => {
		// Both were 'untitled', which the parser then reported as a collision.
		expect(slugifyTitle('Кнопка')).not.toBe(slugifyTitle('Поле ввода'));
	});

	it('still falls back for a title with no letters at all', () => {
		expect(slugifyTitle('---')).toBe('untitled');
	});
});
