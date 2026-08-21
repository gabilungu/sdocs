import { describe, it, expect } from 'vitest';
import { resolveConfig, resolveAndFinalize } from '../../src/lib/server/config.js';
import { parseSdoc, attributeRules } from '../../src/lib/language/index.js';

describe('mcp config', () => {
	it('defaults on, and honours mcp: false', () => {
		expect(resolveConfig({}).mcp).toBe(true);
		expect(resolveConfig({ mcp: false }).mcp).toBe(false);
	});
});

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
			'\t[component component={B} maxWidth="600px" padding="4px"]',
			'\t\t<B />',
			'\t[/component]',
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
			'\t[component component={B} direction="row" gap="4px"]',
			'\t\t<B />',
			'\t[/component]',
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
			'component', 'args', 'title', 'description', 'synonyms', 'status', 'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY', 'background', 'minHeight',
		]);
		// [component] is the canonical tag for the same block
		expect(attributeRules('component')).toEqual(attributeRules('preview'));
		expect(Object.keys(attributeRules('example'))).toEqual([
			'title', 'description', 'tags', 'code', 'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY', 'background', 'minHeight',
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
		expect(c.sections).toEqual([{ slug: 'docs', title: 'Docs', order: [], dividerAfter: false }]);
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
			{ slug: 'guides', title: 'Guides', order: [], dividerAfter: false },
			{ slug: 'api', title: 'API', order: ['intro'], dividerAfter: false },
		]);
		expect(c.sectionsDeclared).toBe(true);
		expect(c.home).toBe('guides/introduction');
	});

	it('turns a divider entry into a mark on the section before it', () => {
		const c = resolveConfig({
			sections: [{ slug: 'guides' }, { type: 'divider' }, { slug: 'api' }],
		});
		// The divider is never a section of its own — routing, titles and the
		// sidebar go on seeing exactly two.
		expect(c.sections).toEqual([
			{ slug: 'guides', title: 'Guides', order: [], dividerAfter: true },
			{ slug: 'api', title: 'Api', order: [], dividerAfter: false },
		]);
	});

	it('drops a divider with no section before it', () => {
		const c = resolveConfig({ sections: [{ type: 'divider' }, { slug: 'guides' }] });
		expect(c.sections).toEqual([
			{ slug: 'guides', title: 'Guides', order: [], dividerAfter: false },
		]);
	});

	it('survives a second pass — the resolved list is what the app hands back', () => {
		// app-gen serializes the resolved sections into the generated entry, and
		// the Explorer normalizes them again; the rule has to outlive that.
		const once = resolveConfig({
			sections: [{ slug: 'guides' }, { type: 'divider' }, { slug: 'api' }],
		}).sections;
		expect(resolveConfig({ sections: once }).sections).toEqual(once);
	});
});

describe('customization axes', () => {
	it('defaults to none', () => {
		expect(resolveConfig({}).axes).toEqual([]);
	});

	it('fills the label from the id and keeps value order', () => {
		expect(resolveConfig({ axes: [{ id: 'density', values: ['airy', 'compact'] }] }).axes).toEqual([
			{ id: 'density', label: 'Density', values: ['airy', 'compact'] },
		]);
		// A dashed id reads as words, not as a slug.
		expect(resolveConfig({ axes: [{ id: 'brand-palette', values: ['a', 'b'] }] }).axes[0].label).toBe(
			'Brand palette',
		);
		expect(
			resolveConfig({ axes: [{ id: 'scheme', label: 'Theme', values: ['light', 'dark'] }] }).axes[0]
				.label,
		).toBe('Theme');
	});

	it('drops axes that could not work', () => {
		const axes = resolveConfig({
			axes: [
				{ id: 'ok', values: ['a', 'b'] },
				// Nothing to switch between — the control would be inert.
				{ id: 'lonely', values: ['only'] },
				// Would collide with the stage identity attributes.
				{ id: 'sdocs-theme', values: ['a', 'b'] },
				// Not usable as an attribute name.
				{ id: 'Has Spaces', values: ['a', 'b'] },
				{ id: '', values: ['a', 'b'] },
				// Second one wins nothing; the first is kept.
				{ id: 'ok', values: ['c', 'd'] },
			],
		}).axes;
		expect(axes).toEqual([{ id: 'ok', label: 'Ok', values: ['a', 'b'] }]);
	});

	it('is idempotent — resolving an already-resolved config changes nothing', () => {
		const once = resolveConfig({ axes: [{ id: 'scheme', values: ['light', 'dark'] }] });
		expect(resolveConfig(once).axes).toEqual(once.axes);
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

describe('config values that cannot work are refused loudly', () => {
	// Each of these used to be accepted and then quietly do nothing, which is
	// the worst shape a config mistake can take: the symptom (unstyled stages,
	// a server on the wrong port) points anywhere but at the config line.

	it('drops a css array rather than rendering every stage unstyled', () => {
		expect(resolveConfig({ css: ['./a.css'] as never }).css).toBeNull();
	});

	it('drops css entries whose path is not a string, keeping the rest', () => {
		expect(resolveConfig({ css: { light: './l.css', dark: 42 } as never }).css).toEqual({
			light: './l.css',
		});
	});

	it('still accepts the two documented shapes', () => {
		expect(resolveConfig({ css: './app.css' }).css).toBe('./app.css');
		expect(resolveConfig({ css: { light: './l.css', dark: './d.css' } }).css).toEqual({
			light: './l.css',
			dark: './d.css',
		});
	});

	it('records whether the port was asked for, so dev can hold it', () => {
		// An explicit port is an instruction: sliding to the next free one hides
		// a stale server behind one that answers with the old config.
		expect(resolveConfig({}).portDeclared).toBe(false);
		expect(resolveConfig({}).port).toBe(3000);
		expect(resolveConfig({ port: 3021 }).portDeclared).toBe(true);
		expect(resolveConfig({ port: 3021 }).port).toBe(3021);
	});
});

describe('the scale slider', () => {
	it('is absent unless configured', () => {
		expect(resolveConfig({}).scale).toBeNull();
	});

	it('fills the documented defaults around whatever is given', () => {
		expect(resolveConfig({ scale: {} }).scale).toEqual({
			min: 0.75, max: 1.5, default: 1, step: 0.05, var: '--scale', label: 'Scale', presets: [],
		});
		expect(resolveConfig({ scale: { min: 1, max: 2, var: '--ui-scale' } }).scale).toMatchObject({
			min: 1, max: 2, var: '--ui-scale',
		});
	});

	it('refuses a range that cannot produce a usable control', () => {
		// Silently dropping these leaves a missing slider, which reads as sdocs
		// ignoring the config rather than as the config being wrong.
		expect(resolveConfig({ scale: { min: 2, max: 1 } }).scale).toBeNull();
		expect(resolveConfig({ scale: { min: 1, max: 1 } }).scale).toBeNull();
		expect(resolveConfig({ scale: { step: 0 } }).scale).toBeNull();
		expect(resolveConfig({ scale: { var: 'scale' } }).scale).toBeNull();
	});

	it('pulls a default that sits outside the range back into it', () => {
		expect(resolveConfig({ scale: { min: 1, max: 2, default: 5 } }).scale?.default).toBe(2);
		expect(resolveConfig({ scale: { min: 1, max: 2, default: 0 } }).scale?.default).toBe(1);
	});

	it('resolves idempotently, like the rest of the config', () => {
		const once = resolveConfig({ scale: { min: 1, max: 2 } });
		expect(resolveConfig(once).scale).toEqual(once.scale);
	});
});

describe('scale presets', () => {
	const base = { min: 0.75, max: 1.5 };

	it('defaults to none', () => {
		expect(resolveConfig({ scale: base }).scale?.presets).toEqual([]);
	});

	it('keeps presets inside the range, in order', () => {
		const presets = [
			{ label: 'S', value: 0.875 },
			{ label: 'M', value: 1 },
		];
		expect(resolveConfig({ scale: { ...base, presets } }).scale?.presets).toEqual(presets);
	});

	it('refuses a preset the slider could not reach', () => {
		// Clamping would give a button labelled "XL" that lands somewhere other
		// than its declared value — worse than no button, and harder to notice.
		const presets = [
			{ label: 'M', value: 1 },
			{ label: 'XL', value: 2 },
		];
		expect(resolveConfig({ scale: { ...base, presets } }).scale?.presets).toEqual([
			{ label: 'M', value: 1 },
		]);
	});

	it('refuses a preset missing a label or a numeric value', () => {
		const presets = [
			{ label: '', value: 1 },
			{ label: 'X', value: 'big' },
			{ label: 'M', value: 1 },
		] as never;
		expect(resolveConfig({ scale: { ...base, presets } }).scale?.presets).toEqual([
			{ label: 'M', value: 1 },
		]);
	});

	it('resolves idempotently', () => {
		const once = resolveConfig({ scale: { ...base, presets: [{ label: 'M', value: 1 }] } });
		expect(resolveConfig(once).scale).toEqual(once.scale);
	});
});
