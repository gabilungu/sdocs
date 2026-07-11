import { describe, it, expect } from 'vitest';
import { resolveConfig, resolveAndFinalize } from '../../src/lib/server/config.js';
import { parseSdoc, attributeRules } from '../../src/lib/language/index.js';

describe('content sizing config', () => {
	it('applies the documented defaults', () => {
		const c = resolveConfig({});
		expect(c.content.doc).toEqual({ maxWidth: '1200px', padding: '32px', toc: true, contentX: 'left' });
		expect(c.content.page).toEqual({ maxWidth: '1200px', padding: '32px', contentX: 'left' });
		expect(c.content.showcase).toEqual({
			maxWidth: '1200px',
			padding: '16px',
			direction: 'row',
			gap: '16px',
			contentX: 'left',
			contentY: 'top',
			background: null,
			minHeight: null,
		});
		expect(c.content.layout).toEqual({ maxWidth: '100%', padding: '0px', background: null, minHeight: null });
	});

	it('merges partial overrides per kind', () => {
		const c = resolveConfig({
			content: {
				doc: { padding: '48px', toc: false },
				showcase: { direction: 'column', contentX: 'center' },
				layout: { maxWidth: '900px' },
			},
		});
		expect(c.content.doc).toEqual({ maxWidth: '1200px', padding: '48px', toc: false, contentX: 'left' });
		expect(c.content.showcase).toEqual({
			maxWidth: '1200px',
			padding: '16px',
			direction: 'column',
			gap: '16px',
			contentX: 'center',
			contentY: 'top',
			background: null,
			minHeight: null,
		});
		expect(c.content.layout).toEqual({ maxWidth: '900px', padding: '0px', background: null, minHeight: null });
	});
});

describe('sizing attributes', () => {
	it('accepts maxWidth and padding on every entity and block', () => {
		const source = [
			'<script>',
			"\timport B from './B.svelte';",
			'</script>',
			'',
			'[SHOWCASE title="D" maxWidth="1000px" padding="8px"]',
			'',
			'\t[preview component={B} maxWidth="600px" padding="4px"]',
			'\t\t<B />',
			'\t[/preview]',
			'',
			'\t[example title="E" maxWidth="700px" padding="12px"]',
			'\t\t<B />',
			'\t[/example]',
			'',
			'[/SHOWCASE]',
			'',
			'[DOC title="P" maxWidth="900px" padding="20px"]',
			'\thi',
			'[/DOC]',
			'',
			'[LAYOUT title="L" maxWidth="80%" padding="0"]',
			'\t<B />',
			'[/LAYOUT]',
		].join('\n');
		const doc = parseSdoc(source);
		expect(doc.diagnostics).toEqual([]);
		const [docs, page, layout] = doc.entities;
		expect(docs.sizing).toMatchObject({ maxWidth: '1000px', padding: '8px' });
		expect(page.sizing).toMatchObject({ maxWidth: '900px', padding: '20px' });
		expect(layout.sizing).toMatchObject({ maxWidth: '80%', padding: '0' });
		if (docs.kind === 'SHOWCASE') {
			expect(docs.previews[0].sizing).toMatchObject({ maxWidth: '600px', padding: '4px' });
			expect(docs.examples[0].sizing).toMatchObject({ maxWidth: '700px', padding: '12px' });
		}
	});

	it('accepts direction/gap on stages and toc on DOC', () => {
		const source = [
			'<script>',
			"\timport B from './B.svelte';",
			'</script>',
			'',
			'[SHOWCASE title="D" direction="column" gap="8px"]',
			'',
			'\t[preview component={B} direction="row" gap="4px"]',
			'\t\t<B />',
			'\t[/preview]',
			'',
			'[/SHOWCASE]',
			'',
			'[DOC title="P" toc="false"]',
			'\thi',
			'[/DOC]',
		].join('\n');
		const doc = parseSdoc(source);
		expect(doc.diagnostics).toEqual([]);
		const [docs, page] = doc.entities;
		expect(docs.sizing).toMatchObject({ direction: 'column', gap: '8px' });
		expect(page.sizing).toMatchObject({ toc: false });
		if (docs.kind === 'SHOWCASE') {
			expect(docs.previews[0].sizing).toMatchObject({ direction: 'row', gap: '4px' });
		}
	});

	it('rejects toc on non-DOC entities and direction on DOC', () => {
		const bad1 = parseSdoc('[SHOWCASE title="D" toc="false"]\n[/SHOWCASE]\n');
		expect(bad1.diagnostics.map((d) => d.code)).toContain('unknown-attr');
		const bad2 = parseSdoc('[DOC title="P" direction="row"]\nx\n[/DOC]\n');
		expect(bad2.diagnostics.map((d) => d.code)).toContain('unknown-attr');
		const bad3 = parseSdoc('[PAGE title="P" toc="false"]\n<div>x</div>\n[/PAGE]\n');
		expect(bad3.diagnostics.map((d) => d.code)).toContain('unknown-attr');
	});
});

describe('attributeRules (shared by diagnostics and completions)', () => {
	it('exposes the full attribute set per block kind', () => {
		expect(Object.keys(attributeRules('preview'))).toEqual([
			'component', 'args', 'title', 'description', 'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY', 'background', 'minHeight',
		]);
		// [component] is the canonical tag for the same block
		expect(attributeRules('component')).toEqual(attributeRules('preview'));
		expect(Object.keys(attributeRules('example'))).toEqual([
			'title', 'description', 'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY', 'background', 'minHeight',
		]);
		expect(Object.keys(attributeRules('DOC'))).toEqual([
			'title', 'slug', 'hide', 'maxWidth', 'padding', 'contentX', 'toc',
		]);
		expect(Object.keys(attributeRules('PAGE'))).toEqual([
			'title', 'slug', 'hide', 'maxWidth', 'padding', 'contentX',
		]);
		expect(Object.keys(attributeRules('SHOWCASE'))).toContain('gap');
		expect(Object.keys(attributeRules('SHOWCASE'))).toContain('slug');
		expect(Object.keys(attributeRules('LAYOUT'))).toEqual(['title', 'slug', 'hide', 'maxWidth', 'padding', 'background', 'minHeight']);
	});

	it('carries value kind and required flag for each attribute', () => {
		const preview = attributeRules('preview');
		expect(preview.component).toMatchObject({ required: true, kind: 'expression' });
		expect(preview.args.kind).toBe('expression');
		expect(preview.padding).toMatchObject({ required: false, kind: 'string' });
	});

	it('returns an empty map for an unknown kind', () => {
		expect(attributeRules('nope')).toEqual({});
	});
});

describe('static assets folder', () => {
	it('defaults to null and resolves relative paths against the root', () => {
		expect(resolveConfig({}).static).toBeNull();
		expect(resolveAndFinalize({ static: './static' }, '/proj').static).toBe('/proj/static');
		expect(resolveAndFinalize({ static: '/elsewhere/assets' }, '/proj').static).toBe('/elsewhere/assets');
	});
});

describe('doc content alignment', () => {
	it('accepts contentX on [DOC] and resolves the config default', () => {
		const doc = parseSdoc('[DOC title="P" contentX="center"]\n\thi\n[/DOC]\n');
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0].sizing.contentX).toBe('center');
		expect(resolveConfig({}).content.doc.contentX).toBe('left');
		expect(resolveConfig({ content: { doc: { contentX: 'center' } } }).content.doc.contentX).toBe('center');
	});
});

describe('header title/logo (renamed from logo/icon)', () => {
	it('defaults: sdocs title, built-in mascot logo', () => {
		const c = resolveConfig({});
		expect(c.title).toBe('sdocs');
		expect(c.logo).toBe('sdocs');
	});

	it('new keys pass through', () => {
		const c = resolveConfig({ title: 'gabi', logo: './mascot.svg' });
		expect(c.title).toBe('gabi');
		expect(c.logo).toBe('./mascot.svg');
	});

	it('legacy shape (icon present) maps logo→title and icon→logo', () => {
		const c = resolveConfig({ logo: 'MyLib', icon: './m.png' } as never);
		expect(c.title).toBe('MyLib');
		expect(c.logo).toBe('./m.png');
	});

	it('favicon defaults to the built-in icon and passes a value through', () => {
		expect(resolveConfig({}).favicon).toBe('./explorer/favicon.png');
		expect(resolveConfig({ favicon: '/logo.svg' }).favicon).toBe('/logo.svg');
	});
});

describe('sections config', () => {
	it('defaults to the implicit docs section', () => {
		const c = resolveConfig({});
		expect(c.sections).toEqual([{ slug: 'docs', title: 'Docs', order: [] }]);
		expect(c.sectionsDeclared).toBe(false);
		expect(c.home).toBeNull();
		expect(c.routing).toBeNull();
	});

	it('normalizes declared sections and the home path', () => {
		const c = resolveConfig({
			sections: [{ slug: 'guides' }, { slug: 'api', title: 'API', order: ['intro'] }],
			home: '/guides/introduction/',
		});
		expect(c.sections).toEqual([
			{ slug: 'guides', title: 'Guides', order: [] },
			{ slug: 'api', title: 'API', order: ['intro'] },
		]);
		expect(c.sectionsDeclared).toBe(true);
		expect(c.home).toBe('guides/introduction');
	});
});

describe('base path', () => {
	it('defaults to /', () => {
		expect(resolveConfig({}).base).toBe('/');
	});

	it('normalizes to a leading + trailing slash', () => {
		expect(resolveConfig({ base: 'gabi' }).base).toBe('/gabi/');
		expect(resolveConfig({ base: '/gabi' }).base).toBe('/gabi/');
		expect(resolveConfig({ base: 'gabi/' }).base).toBe('/gabi/');
		expect(resolveConfig({ base: '/gabi/' }).base).toBe('/gabi/');
		expect(resolveConfig({ base: '/' }).base).toBe('/');
	});
});
