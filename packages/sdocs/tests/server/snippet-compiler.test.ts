import { describe, expect, it } from 'vitest';
import {
	generateIframeComponent,
	resolveScriptImports,
} from '../../src/lib/server/snippet-compiler.js';

describe('root ref injection', () => {
	it('binds the documented component, not the wrapper', () => {
		const out = generateIframeComponent('', '<Tabs>\n\t<Tab {...args} />\n</Tabs>', [], 'Tab');
		expect(out).toContain('<Tab bind:this={__sdocsRef} {...args} />');
		expect(out).not.toContain('<Tabs bind:this');
	});

	it('binds the first capitalized tag when no component is named', () => {
		const out = generateIframeComponent('', '<Card><Button /></Card>', []);
		expect(out).toContain('<Card bind:this={__sdocsRef}>');
	});

	it('falls back to the first capitalized tag when the named component is absent', () => {
		const out = generateIframeComponent('', '<Tabs active={0}>text</Tabs>', [], 'Tab');
		expect(out).toContain('<Tabs bind:this={__sdocsRef} active={0}>');
	});

	it('leaves snippets with an author bind:this untouched', () => {
		const body = '<Tab bind:this={mine} />';
		const out = generateIframeComponent('', body, [], 'Tab');
		expect(out).toContain(body);
		expect(out).not.toContain('bind:this={__sdocsRef}');
	});
});

describe('script prelude (shared values)', () => {
	it('lifts imports AND shared values from the file script into the preview', () => {
		const prelude = "import Select from '/abs/Select.svelte';\nconst sizes = [{ label: 'xs', value: 'xs' }];";
		const out = generateIframeComponent(prelude, '<Select options={sizes} />', []);
		expect(out).toContain("import Select from '/abs/Select.svelte';");
		expect(out).toContain('const sizes = [');
	});

	it('resolves relative import specifiers in the script to absolute paths', () => {
		const script = `import Button from './Button.svelte';\nimport './styles.css';`;
		const resolved = resolveScriptImports(script, '/proj/src/Widget.sdoc');
		expect(resolved).toContain("import Button from '/proj/src/Button.svelte'");
		expect(resolved).toContain("import '/proj/src/styles.css'");
	});
});

describe('stage sizing', () => {
	it('applies padding and max-width inside the iframe, centered', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '800px',
			padding: '24px',
		});
		expect(out).toContain('style="display: flow-root; padding: 24px; max-width: 800px; margin-inline: auto"');
	});

	it('full-width stages get padding only', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%',
			padding: '16px',
		});
		expect(out).toContain('style="display: flow-root; padding: 16px"');
		expect(out).not.toContain('margin-inline');
	});

	it('flexes preview stages when direction is set', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%',
			padding: '16px',
			direction: 'column',
			gap: '8px',
			align: 'left',
			alignY: 'top',
		});
		expect(out).toContain(
			'style="display: flex; flex-direction: column; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start; gap: 8px; padding: 16px"',
		);
	});

	it('maps align/alignY to the right flex axis for a row', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%', padding: '16px', direction: 'row', gap: '8px',
			align: 'center', alignY: 'bottom',
		});
		// row: horizontal → justify-content, vertical → align-items
		expect(out).toContain('justify-content: center; align-items: flex-end');
	});

	it('flips the axes for a column, and "justify" spreads along the flow', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%', padding: '16px', direction: 'column', gap: '8px',
			align: 'right', alignY: 'justify',
		});
		// column: vertical → justify-content (justify=space-between), horizontal → align-items
		expect(out).toContain('justify-content: space-between; align-items: flex-end');
	});

	it('clamps a cross-axis "justify" to stretch (align-items has no space-between)', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%', padding: '16px', direction: 'column', gap: '8px',
			align: 'justify', alignY: 'top',
		});
		// column: horizontal(align=justify) → cross axis → space-between clamped to stretch
		expect(out).toContain('justify-content: flex-start; align-items: stretch');
	});

	it('stays bare flow-root without a stage', () => {
		const out = generateIframeComponent('', '<b>x</b>');
		expect(out).toContain('style="display: flow-root"');
	});
});
