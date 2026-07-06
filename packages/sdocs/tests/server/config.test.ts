import { describe, it, expect } from 'vitest';
import { resolveConfig, resolveAndFinalize } from '../../src/lib/server/config.js';
import { parseSdoc, attributeRules } from '../../src/lib/language/index.js';

describe('content sizing config', () => {
	it('applies the documented defaults', () => {
		const c = resolveConfig({});
		expect(c.content.page).toEqual({ maxWidth: '1200px', padding: '32px', toc: true, contentX: 'left' });
		expect(c.content.docs).toEqual({
			maxWidth: '1200px',
			padding: '16px',
			direction: 'row',
			gap: '16px',
			contentX: 'left',
			contentY: 'top',
		});
		expect(c.content.layout).toEqual({ maxWidth: '100%', padding: '0px' });
	});

	it('merges partial overrides per kind', () => {
		const c = resolveConfig({
			content: {
				page: { padding: '48px', toc: false },
				docs: { direction: 'column', contentX: 'center' },
				layout: { maxWidth: '900px' },
			},
		});
		expect(c.content.page).toEqual({ maxWidth: '1200px', padding: '48px', toc: false, contentX: 'left' });
		expect(c.content.docs).toEqual({
			maxWidth: '1200px',
			padding: '16px',
			direction: 'column',
			gap: '16px',
			contentX: 'center',
			contentY: 'top',
		});
		expect(c.content.layout).toEqual({ maxWidth: '900px', padding: '0px' });
	});
});

describe('sizing attributes', () => {
	it('accepts maxWidth and padding on every entity and block', () => {
		const source = [
			'<script>',
			"\timport B from './B.svelte';",
			'</script>',
			'',
			'[DOCS title="D" maxWidth="1000px" padding="8px"]',
			'',
			'\t[preview component={B} maxWidth="600px" padding="4px"]',
			'\t\t<B />',
			'\t[/preview]',
			'',
			'\t[example title="E" maxWidth="700px" padding="12px"]',
			'\t\t<B />',
			'\t[/example]',
			'',
			'[/DOCS]',
			'',
			'[PAGE title="P" maxWidth="900px" padding="20px"]',
			'\thi',
			'[/PAGE]',
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
		if (docs.kind === 'DOCS') {
			expect(docs.previews[0].sizing).toMatchObject({ maxWidth: '600px', padding: '4px' });
			expect(docs.examples[0].sizing).toMatchObject({ maxWidth: '700px', padding: '12px' });
		}
	});

	it('accepts direction/gap on stages and toc on PAGE', () => {
		const source = [
			'<script>',
			"\timport B from './B.svelte';",
			'</script>',
			'',
			'[DOCS title="D" direction="column" gap="8px"]',
			'',
			'\t[preview component={B} direction="row" gap="4px"]',
			'\t\t<B />',
			'\t[/preview]',
			'',
			'[/DOCS]',
			'',
			'[PAGE title="P" toc="false"]',
			'\thi',
			'[/PAGE]',
		].join('\n');
		const doc = parseSdoc(source);
		expect(doc.diagnostics).toEqual([]);
		const [docs, page] = doc.entities;
		expect(docs.sizing).toMatchObject({ direction: 'column', gap: '8px' });
		expect(page.sizing).toMatchObject({ toc: false });
		if (docs.kind === 'DOCS') {
			expect(docs.previews[0].sizing).toMatchObject({ direction: 'row', gap: '4px' });
		}
	});

	it('rejects toc on non-PAGE entities and direction on PAGE', () => {
		const bad1 = parseSdoc('[DOCS title="D" toc="false"]\n[/DOCS]\n');
		expect(bad1.diagnostics.map((d) => d.code)).toContain('unknown-attr');
		const bad2 = parseSdoc('[PAGE title="P" direction="row"]\nx\n[/PAGE]\n');
		expect(bad2.diagnostics.map((d) => d.code)).toContain('unknown-attr');
	});
});

describe('attributeRules (shared by diagnostics and completions)', () => {
	it('exposes the full attribute set per block kind', () => {
		expect(Object.keys(attributeRules('preview'))).toEqual([
			'component', 'args', 'title', 'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY',
		]);
		expect(Object.keys(attributeRules('example'))).toEqual([
			'title', 'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY',
		]);
		expect(Object.keys(attributeRules('PAGE'))).toEqual([
			'title', 'maxWidth', 'padding', 'contentX', 'toc', 'home',
		]);
		expect(Object.keys(attributeRules('DOCS'))).toContain('gap');
		expect(Object.keys(attributeRules('LAYOUT'))).toEqual(['title', 'maxWidth', 'padding']);
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

describe('page content alignment', () => {
	it('accepts contentX on [PAGE] and resolves the config default', () => {
		const doc = parseSdoc('[PAGE title="P" contentX="center"]\n\thi\n[/PAGE]\n');
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0].sizing.contentX).toBe('center');
		expect(resolveConfig({}).content.page.contentX).toBe('left');
		expect(resolveConfig({ content: { page: { contentX: 'center' } } }).content.page.contentX).toBe('center');
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
});

describe('sections config', () => {
	it('defaults', () => {
		const c = resolveConfig({});
		expect(c.sections).toEqual([]);
		expect(c.defaultSection).toBe('Docs');
		expect(c.routing).toBeNull();
	});

	it('passes through', () => {
		const c = resolveConfig({ sections: ['Guides'], defaultSection: 'Reference', routing: 'hash' });
		expect(c.sections).toEqual(['Guides']);
		expect(c.defaultSection).toBe('Reference');
		expect(c.routing).toBe('hash');
	});
});
