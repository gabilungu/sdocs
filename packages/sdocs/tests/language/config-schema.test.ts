import { describe, it, expect } from 'vitest';
import { configSchema } from '../../src/lib/language/index.js';

describe('configSchema (drives config completion without an install)', () => {
	it('exposes the top-level config keys', () => {
		expect(Object.keys(configSchema)).toEqual([
			'include', 'port', 'open', 'css', 'static', 'title', 'logo', 'favicon',
			'sections', 'home', 'routing', 'base', 'content',
		]);
	});

	it('nests the content stages with their own keys', () => {
		const content = configSchema.content.object!;
		expect(Object.keys(content)).toEqual(['doc', 'page', 'showcase', 'layout']);
		expect(Object.keys(content.doc.object!)).toEqual(['maxWidth', 'padding', 'toc', 'contentX']);
		expect(Object.keys(content.page.object!)).toEqual(['maxWidth', 'padding', 'contentX']);
		expect(Object.keys(content.showcase.object!)).toEqual([
			'maxWidth', 'padding', 'direction', 'gap', 'contentX', 'contentY', 'background', 'minHeight',
		]);
		expect(Object.keys(content.layout.object!)).toEqual(['maxWidth', 'padding']);
	});

	it('carries enum values for aligned keys', () => {
		const docs = configSchema.content.object!.showcase.object!;
		expect(docs.contentX.values).toEqual(['left', 'center', 'right', 'justify']);
		expect(docs.contentY.values).toEqual(['top', 'middle', 'bottom', 'justify']);
		expect(docs.contentX.quoted).toBe(true);
		expect(configSchema.content.object!.doc.object!.toc.values).toEqual(['true', 'false']);
	});
});
