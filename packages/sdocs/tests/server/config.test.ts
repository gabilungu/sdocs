import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../../src/lib/server/config.js';
import { parseSdoc, attributeRules } from '../../src/lib/language/index.js';

describe('content sizing config', () => {
	it('applies the documented defaults', () => {
		const c = resolveConfig({});
		expect(c.content.page).toEqual({ maxWidth: '1200px', padding: '32px', toc: true });
		expect(c.content.docs).toEqual({
			maxWidth: '1200px',
			padding: '16px',
			direction: 'row',
			gap: '16px',
			align: 'left',
			alignY: 'top',
		});
		expect(c.content.layout).toEqual({ maxWidth: '100%', padding: '0px' });
	});

	it('merges partial overrides per kind', () => {
		const c = resolveConfig({
			content: {
				page: { padding: '48px', toc: false },
				docs: { direction: 'column', align: 'center' },
				layout: { maxWidth: '900px' },
			},
		});
		expect(c.content.page).toEqual({ maxWidth: '1200px', padding: '48px', toc: false });
		expect(c.content.docs).toEqual({
			maxWidth: '1200px',
			padding: '16px',
			direction: 'column',
			gap: '16px',
			align: 'center',
			alignY: 'top',
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
			'component', 'args', 'title', 'maxWidth', 'padding', 'direction', 'gap', 'align', 'alignY',
		]);
		expect(Object.keys(attributeRules('example'))).toEqual([
			'title', 'maxWidth', 'padding', 'direction', 'gap', 'align', 'alignY',
		]);
		expect(Object.keys(attributeRules('PAGE'))).toEqual([
			'title', 'maxWidth', 'padding', 'toc',
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
