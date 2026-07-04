import { describe, expect, it } from 'vitest';
import { generateIframeComponent } from './snippet-compiler.js';

describe('root ref injection', () => {
	it('binds the documented component, not the wrapper', () => {
		const out = generateIframeComponent([], '<Tabs>\n\t<Tab {...args} />\n</Tabs>', [], 'Tab');
		expect(out).toContain('<Tab bind:this={__sdocsRef} {...args} />');
		expect(out).not.toContain('<Tabs bind:this');
	});

	it('binds the first capitalized tag when no component is named', () => {
		const out = generateIframeComponent([], '<Card><Button /></Card>', []);
		expect(out).toContain('<Card bind:this={__sdocsRef}>');
	});

	it('falls back to the first capitalized tag when the named component is absent', () => {
		const out = generateIframeComponent([], '<Tabs active={0}>text</Tabs>', [], 'Tab');
		expect(out).toContain('<Tabs bind:this={__sdocsRef} active={0}>');
	});

	it('leaves snippets with an author bind:this untouched', () => {
		const body = '<Tab bind:this={mine} />';
		const out = generateIframeComponent([], body, [], 'Tab');
		expect(out).toContain(body);
		expect(out).not.toContain('bind:this={__sdocsRef}');
	});
});
