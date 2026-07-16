/**
 * Declared sections + slug routes: config section objects define the top bar
 * and the valid `@slug/` title prefixes; every navigable node gets a
 * slugified route. Structure problems surface as errors, never as repairs.
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
	kind: DocEntry['kind'] = 'doc',
	extra: Partial<DocEntry> = {},
): DocEntry {
	return {
		kind,
		filePath: `/x/${title.replace(/[^A-Za-z]+/g, '_')}.sdoc`,
		entitySlug: 'e',
		meta: { title },
		previews: [],
		examples: (extra.examples as DocEntry['examples']) ?? [],
		content: null,
		...extra,
	};
}

function examples(names: string[]): DocEntry['examples'] {
	return names.map((name) => ({ name, slug: slugifySegment(name), role: 'example', body: '' }));
}

describe('splitSection', () => {
	it('splits an @slug first segment off', () => {
		expect(splitSection('@guides/Installation')).toEqual({
			section: 'guides',
			rest: 'Installation',
		});
		expect(splitSection('@components/:Form / Button')).toEqual({
			section: 'components',
			rest: ':Form / Button',
		});
	});

	it('leaves plain titles alone', () => {
		expect(splitSection('Markdown')).toEqual({ section: null, rest: 'Markdown' });
	});
});

describe('displayTitle', () => {
	it('strips the section prefix and the whole group segment', () => {
		// The sidebar already shows the group — the page title is just the name.
		expect(displayTitle('@components/:Form / Button')).toBe('Button');
		expect(displayTitle('@components/Icon')).toBe('Icon');
		expect(displayTitle(':Utils / Placeholder')).toBe('Placeholder');
		expect(displayTitle('Markdown')).toBe('Markdown');
		// Plain folders (no ':' group) show the leaf too — never the full path.
		expect(displayTitle('Components/Button')).toBe('Button');
		expect(displayTitle('Forms / Inputs / Text')).toBe('Text');
		expect(displayTitle('@components/:Layout / sdocs / Button')).toBe('Button');
	});
});

describe('buildSections without declared sections', () => {
	it('everything lands in the implicit docs section, routes unprefixed', () => {
		const map = buildSections([doc('Markdown'), doc(':Form / Button', 'component')]);
		expect(map.active).toBe(false);
		expect(map.errors).toEqual([]);
		expect(map.sections.map((s) => s.slug)).toEqual(['docs']);
		expect(map.routes.has('markdown')).toBe(true);
		expect(map.routes.has('form/button')).toBe(true);
	});

	it('an @prefix is an error when no sections are declared', () => {
		const map = buildSections([doc('@guides/Intro')]);
		expect(map.errors.some((e) => e.message.includes('Unknown section "@guides"'))).toBe(true);
	});
});

describe('buildSections with declared sections', () => {
	const sections = [
		{ slug: 'guides', title: 'Guides' },
		{ slug: 'components' },
	];

	it('partitions docs by slug; routes carry the section; titles default', () => {
		const map = buildSections(
			[doc('@guides/Installation'), doc('@components/:Form / Button', 'component')],
			{ sections },
		);
		expect(map.active).toBe(true);
		expect(map.errors).toEqual([]);
		expect(map.sections.map((s) => s.title)).toEqual(['Guides', 'Components']);
		expect(map.routes.has('guides/installation')).toBe(true);
		expect(map.routes.has('components/form/button')).toBe(true);
	});

	it('unknown @section and missing docs section are errors', () => {
		const map = buildSections([doc('@nope/X'), doc('Loose')], { sections });
		const messages = map.errors.map((e) => e.message).join('\n');
		expect(messages).toContain('Unknown section "@nope"');
		expect(messages).toContain('no "docs" section is declared');
	});

	it('unprefixed docs are fine when a docs section is declared', () => {
		const map = buildSections([doc('Loose')], {
			sections: [{ slug: 'docs' }, { slug: 'guides' }],
		});
		expect(map.errors).toEqual([]);
		expect(map.routes.has('docs/loose')).toBe(true);
	});

	it('invalid or duplicate section slugs are errors', () => {
		const map = buildSections([], { sections: [{ slug: 'Bad Slug' }, { slug: 'a' }, { slug: 'a' }] });
		const messages = map.errors.map((e) => e.message).join('\n');
		expect(messages).toContain('must be lowercase');
		expect(messages).toContain('share the slug "a"');
	});
});

describe('sectionless pages', () => {
	const sections = [{ slug: 'guides' }, { slug: 'components' }];

	it('an unprefixed PAGE routes at the site root with no section', () => {
		const map = buildSections([doc('Welcome', 'page'), doc('@guides/Intro')], { sections });
		expect(map.errors).toEqual([]);
		expect(map.routes.has('welcome')).toBe(true);
		expect(map.routes.get('welcome')?.section).toBeUndefined();
		expect(map.routes.get('guides/intro')?.section).toBe('guides');
		// not listed in any section tree
		expect(map.sections.every((s) => s.tree.every((n) => n.name !== 'Welcome'))).toBe(true);
	});

	it('non-PAGE kinds still need a section', () => {
		const map = buildSections([doc('Loose', 'doc'), doc('Alone', 'layout')], { sections });
		expect(map.errors.length).toBe(2);
	});

	it('a root page route may not shadow a section slug or /about', () => {
		const map = buildSections(
			[doc('Guides', 'page'), doc('About', 'page')],
			{ sections },
		);
		const messages = map.errors.map((e) => e.message).join('\n');
		expect(messages).toContain('collides with the "guides" section');
		expect(messages).toContain('reserved');
	});

	it('home may point at a root page', () => {
		const map = buildSections([doc('Welcome', 'page')], { sections, home: 'welcome' });
		expect(map.errors).toEqual([]);
		expect(map.home?.doc.meta.title).toBe('Welcome');
	});
});

describe('routes', () => {
	it('slug attribute overrides the leaf; collisions are errors', () => {
		const clash = buildSections([doc('Getting Started!'), doc('Getting  started')]);
		expect(clash.errors.some((e) => e.message.includes('share the route "/getting-started"'))).toBe(
			true,
		);

		const fixed = buildSections([
			doc('Getting Started!'),
			doc('Getting  started', 'page', { routeSlug: 'getting-started-guide' }),
		]);
		expect(fixed.errors).toEqual([]);
		expect(fixed.routes.has('getting-started')).toBe(true);
		expect(fixed.routes.has('getting-started-guide')).toBe(true);
	});

	it('component examples get child routes carrying the snippet name', () => {
		const map = buildSections([
			doc(':Form / Button', 'component', { examples: examples(['Sizes']) }),
		]);
		expect(map.routes.get('form/button/sizes')?.snippetName).toBe('Sizes');
		expect(map.routes.get('form/button')?.snippetName).toBeUndefined();
	});
});

describe('hide', () => {
	it('hidden entities keep their route but leave the sidebar', () => {
		const map = buildSections([doc('Secret', 'page', { hide: true }), doc('Markdown')]);
		expect(map.errors).toEqual([]);
		expect(map.routes.has('secret')).toBe(true);
		const names = map.sections[0].tree.map((n) => n.name);
		expect(names).toContain('Markdown');
		expect(names).not.toContain('Secret');
	});

	it('a folder emptied by hiding disappears', () => {
		const map = buildSections([doc('Internal / Secret', 'page', { hide: true })]);
		expect(map.sections[0].tree).toEqual([]);
		expect(map.routes.has('internal/secret')).toBe(true);
	});
});

describe('home', () => {
	it('the config home path resolves the root route (hidden entities too)', () => {
		const map = buildSections([doc('Introduction', 'page', { hide: true }), doc('Markdown')], {
			home: 'introduction',
		});
		expect(map.errors).toEqual([]);
		expect(map.home?.doc.meta.title).toBe('Introduction');
		expect(resolveRoute(map, [])?.doc.meta.title).toBe('Introduction');
	});

	it('an unresolvable home path is an error; no home → root resolves null', () => {
		const bad = buildSections([doc('Markdown')], { home: 'nope' });
		expect(bad.errors.some((e) => e.message.includes('home "nope"'))).toBe(true);
		const none = buildSections([doc('Markdown')]);
		expect(resolveRoute(none, [])).toBeNull();
	});
});

describe('section order arrays', () => {
	it('listed relative paths sort first, the rest alphabetical', () => {
		const map = buildSections(
			[doc('@guides/Theming'), doc('@guides/Introduction'), doc('@guides/Colors')],
			{ sections: [{ slug: 'guides', order: ['introduction', 'colors'] }] },
		);
		expect(map.sections[0].tree.map((n) => n.name)).toEqual([
			'Introduction',
			'Colors',
			'Theming',
		]);
	});

	it('order reaches nested levels via relative route paths', () => {
		const map = buildSections(
			[doc('@g/Stuff / Beta'), doc('@g/Stuff / Alpha')],
			{ sections: [{ slug: 'g', order: ['stuff/beta'] }] },
		);
		const stuff = map.sections[0].tree.find((n) => n.name === 'Stuff')!;
		expect(stuff.children.map((n) => n.name)).toEqual(['Beta', 'Alpha']);
	});
});

describe('resolveRoute', () => {
	it('resolves exact routes only; unknown → null', () => {
		const map = buildSections([doc('@guides/Colors')], { sections: [{ slug: 'guides' }] });
		expect(resolveRoute(map, ['guides', 'colors'])?.doc.meta.title).toBe('@guides/Colors');
		expect(resolveRoute(map, ['colors'])).toBeNull();
		expect(resolveRoute(map, ['nope'])).toBeNull();
	});
});
