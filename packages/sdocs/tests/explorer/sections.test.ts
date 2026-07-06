/**
 * Sections + slug routes: `@Section/` title prefixes group docs under top-bar
 * sections, everything else lands in the default section, and every navigable
 * node gets a slugified URL route.
 */

import { describe, expect, it } from 'vitest';
import {
	buildSections,
	resolveRoute,
	slugifySegment,
	splitSection,
	displayTitle,
} from '../../src/lib/explorer/tree-builder.js';
import type { DocEntry } from '../../src/lib/types.js';

function doc(
	title: string,
	kind: DocEntry['kind'] = 'page',
	examples: string[] = [],
	home = false,
): DocEntry {
	return {
		kind,
		filePath: `/x/${title}.sdoc`,
		entitySlug: 'e',
		meta: { title },
		previews: [],
		examples: examples.map((name) => ({ name, slug: slugifySegment(name), role: 'example', body: '' })),
		content: null,
		home,
	};
}

describe('splitSection', () => {
	it('splits an @Section first segment off', () => {
		expect(splitSection('@Guides/Installation')).toEqual({
			section: 'Guides',
			rest: 'Installation',
		});
		expect(splitSection('@Components/:Form / Button')).toEqual({
			section: 'Components',
			rest: ':Form / Button',
		});
	});

	it('leaves plain titles alone', () => {
		expect(splitSection('Markdown')).toEqual({ section: null, rest: 'Markdown' });
		expect(splitSection(':Form / Button')).toEqual({ section: null, rest: ':Form / Button' });
	});
});

describe('displayTitle', () => {
	it('strips the section prefix and the group sigil', () => {
		expect(displayTitle('@Components/:Form / Button')).toBe('Form / Button');
		expect(displayTitle(':Form / Button')).toBe('Form / Button');
		expect(displayTitle('Markdown')).toBe('Markdown');
	});
});

describe('buildSections', () => {
	it('no @sections → a single default section, routes without a prefix', () => {
		const map = buildSections([doc('Markdown'), doc(':Form / Button', 'component')]);
		expect(map.active).toBe(false);
		expect(map.sections).toHaveLength(1);
		expect(map.sections[0].isDefault).toBe(true);
		expect(map.routes.has('markdown')).toBe(true);
		expect(map.routes.has('form/button')).toBe(true);
	});

	it('@sections split docs; default section holds the rest and comes first', () => {
		const map = buildSections(
			[doc('@Guides/Installation'), doc('Markdown'), doc('@Guides/Theming')],
			undefined,
			{ defaultSection: 'Docs' },
		);
		expect(map.active).toBe(true);
		expect(map.sections.map((s) => s.name)).toEqual(['Docs', 'Guides']);
		expect(map.routes.has('docs/markdown')).toBe(true);
		expect(map.routes.has('guides/installation')).toBe(true);
	});

	it('config order wins; unlisted sections follow alphabetically', () => {
		const map = buildSections(
			[doc('@Alpha/A'), doc('@Zeta/Z'), doc('@Mid/M'), doc('Home')],
			undefined,
			{ defaultSection: 'Docs', order: ['Zeta', 'Docs'] },
		);
		expect(map.sections.map((s) => s.name)).toEqual(['Zeta', 'Docs', 'Alpha', 'Mid']);
	});

	it('routes are slugified; sibling collisions get numbered', () => {
		const map = buildSections([doc('Getting Started!'), doc('Getting  started')]);
		expect(map.routes.has('getting-started')).toBe(true);
		expect(map.routes.has('getting-started-2')).toBe(true);
	});

	it('component examples get child routes carrying the snippet name', () => {
		const map = buildSections([doc(':Form / Button', 'component', ['Sizes'])]);
		const example = map.routes.get('form/button/sizes');
		expect(example?.snippetName).toBe('Sizes');
		expect(map.routes.get('form/button')?.snippetName).toBeUndefined();
	});

	it('each section knows its first doc route for the tab target', () => {
		const map = buildSections([doc('@Guides/Installation'), doc('@Guides/Theming')]);
		expect(map.sections.find((s) => s.name === 'Guides')?.firstRoute).toEqual([
			'guides',
			'installation',
		]);
	});
});

describe('home page', () => {
	it('is recorded, excluded from sidebars, and not routed', () => {
		const map = buildSections([
			doc('Introduction', 'page', [], true),
			doc('@Guides/Colors'),
			doc('@Guides/Markdown'),
		]);
		expect(map.home?.doc.meta.title).toBe('Introduction');
		// not in any sidebar tree
		const names = map.sections.flatMap((s) => s.tree.map((n) => n.name));
		expect(names).not.toContain('Introduction');
		// not registered as a route
		expect([...map.routes.keys()].some((k) => k.includes('introduction'))).toBe(false);
		// the other pages still route
		expect(map.routes.has('guides/colors')).toBe(true);
	});

	it('null when no page is marked home', () => {
		const map = buildSections([doc('Markdown')]);
		expect(map.home).toBeNull();
	});

	it('a home page with @Section does not create an empty section', () => {
		const map = buildSections([doc('@Guides/Intro', 'page', [], true), doc('Markdown')]);
		// Guides had only the home page → no Guides section remains
		expect(map.sections.map((s) => s.name)).toEqual(['Docs']);
		expect(map.home?.doc.meta.title).toBe('@Guides/Intro');
	});
});

describe('resolveRoute', () => {
	it('resolves exact routes and falls back into the default section', () => {
		const map = buildSections([doc('@Guides/Installation'), doc('Markdown')], undefined, {
			defaultSection: 'Docs',
		});
		expect(resolveRoute(map, ['guides', 'installation'])?.doc.meta.title).toBe(
			'@Guides/Installation',
		);
		expect(resolveRoute(map, ['docs', 'markdown'])?.doc.meta.title).toBe('Markdown');
		// a link from before sections existed
		expect(resolveRoute(map, ['markdown'])?.doc.meta.title).toBe('Markdown');
		expect(resolveRoute(map, ['nope'])).toBeNull();
		expect(resolveRoute(map, [])).toBeNull();
	});
});
