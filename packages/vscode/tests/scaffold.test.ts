/**
 * "Create Component Documentation" writes the first .sdoc a lot of people ever
 * see, and it used to write one that took the site down.
 *
 * On a project that declares sections, a title with no `@section/` prefix
 * belongs to no declared section — a site-structure error, and those render
 * full-page over the whole Explorer. So the command whose whole job is to get
 * someone started replaced their docs with an error screen, from a file that
 * looked perfectly reasonable.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sectionPrefixOf } from '../src/section-prefix.js';

describe('sectionPrefixOf', () => {
	it('takes the prefix its neighbours use', () => {
		expect(sectionPrefixOf(['[SHOWCASE title="@components/Button"]'])).toBe('@components/');
	});

	it('takes the most common one when they disagree', () => {
		expect(
			sectionPrefixOf([
				'[SHOWCASE title="@components/Button"]',
				'[SHOWCASE title="@components/Input"]',
				'[DOC title="@guides/Forms"]',
			]),
		).toBe('@components/');
	});

	it('reads a wrapped opener, which is what the formatter writes', () => {
		expect(
			sectionPrefixOf([
				'[SHOWCASE\n\ttitle="@components/Button"\n\tdescription="A button."\n]',
			]),
		).toBe('@components/');
	});

	it('returns nothing when the neighbours carry no prefix', () => {
		// Correct for a project that declares no sections — the default.
		expect(sectionPrefixOf(['[SHOWCASE title="Button"]'])).toBe('');
		expect(sectionPrefixOf([])).toBe('');
	});

	it('ignores an @ that is not an entity title', () => {
		expect(sectionPrefixOf(['\tSee the @components/Button docs.'])).toBe('');
	});

	it('finds the real prefixes in the docs corpus', () => {
		// The corpus is sectioned, so a scaffold beside any of it must be too.
		const dir = resolve(__dirname, '../../../apps/docs/src/docs/language');
		const sources = readdirSync(dir)
			.filter((f) => f.endsWith('.sdoc'))
			.map((f) => readFileSync(join(dir, f), 'utf-8'));
		expect(sources.length).toBeGreaterThan(3);
		expect(sectionPrefixOf(sources)).toBe('@language/');
	});
});
