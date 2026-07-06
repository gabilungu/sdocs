/**
 * The config completion core: given `sdocs.config.*` text and a cursor, work
 * out which config object the cursor is in and whether it's typing a value.
 * The vscode glue (ConfigCompletionProvider) is thin over this; the schema
 * walk and value-position detection are exercised here.
 */

import { describe, expect, it } from 'vitest';
import { scanContext, objectAt, valuePosition } from '../src/configCompletionCore';
import { configSchema } from 'sdocs/language';

/** Split a fixture at the `|` marker into (text, offset). */
function at(marked: string): [string, number] {
	const offset = marked.indexOf('|');
	return [marked.slice(0, offset) + marked.slice(offset + 1), offset];
}

describe('scanContext — which object is the cursor in', () => {
	it('reports the root object at the top level', () => {
		const [text, offset] = at('export default {\n\t|\n};');
		expect(scanContext(text, offset)).toMatchObject({ path: [], valueKey: null });
	});

	it('descends into nested objects', () => {
		const [text, offset] = at('export default {\n\tcontent: {\n\t\tshowcase: {\n\t\t\t|\n\t\t},\n\t},\n};');
		expect(scanContext(text, offset)).toMatchObject({ path: ['content', 'showcase'], valueKey: null });
	});

	it('detects value position after a key', () => {
		const [text, offset] = at('export default {\n\tcontent: {\n\t\tshowcase: { contentX: |');
		expect(scanContext(text, offset)).toMatchObject({ path: ['content', 'showcase'], valueKey: 'contentX' });
	});

	it('detects value position with the cursor inside the opening quote', () => {
		const [text, offset] = at("export default {\n\tcontent: {\n\t\tshowcase: { contentX: 'le|' }");
		expect(scanContext(text, offset)).toMatchObject({ valueKey: 'contentX' });
	});

	it('collects sibling keys already present', () => {
		const [text, offset] = at('export default {\n\tinclude: "x",\n\tport: 3000,\n\t|\n};');
		const ctx = scanContext(text, offset)!;
		expect(ctx.siblings).toEqual(['include', 'port']);
	});

	it('is not fooled by braces or colons inside strings and comments', () => {
		const [text, offset] = at('export default {\n\t// showcase: { nope\n\tcss: "a{b}:c",\n\tcontent: {\n\t\t|\n\t},\n};');
		expect(scanContext(text, offset)).toMatchObject({ path: ['content'] });
	});

	it('ignores commas inside array values when tracking keys', () => {
		const [text, offset] = at('export default {\n\tinclude: ["a", "b"],\n\t|\n};');
		const ctx = scanContext(text, offset)!;
		expect(ctx.siblings).toEqual(['include']);
		expect(ctx.path).toEqual([]);
	});

	it('returns null outside the config object', () => {
		const [text, offset] = at('const x = 1;|\nexport default {};');
		expect(scanContext(text, offset)).toBeNull();
	});
});

describe('objectAt — walk the schema by path', () => {
	it('returns top-level keys for the empty path', () => {
		expect(Object.keys(objectAt(configSchema, [])!)).toContain('content');
	});

	it('descends to the docs stage keys', () => {
		expect(Object.keys(objectAt(configSchema, ['content', 'showcase'])!)).toContain('contentX');
	});

	it('returns null for a non-object path', () => {
		expect(objectAt(configSchema, ['include'])).toBeNull();
		expect(objectAt(configSchema, ['content', 'nope'])).toBeNull();
	});
});

describe('valuePosition — quoting awareness', () => {
	it('flags a bare value slot', () => {
		expect(valuePosition('\t\tcontentX: ')).toEqual({ inString: false });
	});
	it('flags a value slot already inside a quote', () => {
		expect(valuePosition("\t\tcontentX: 'le")).toEqual({ inString: true });
	});
	it('is null when not after a colon', () => {
		expect(valuePosition('\t\tcontent')).toBeNull();
	});
});
