import { describe, expect, it } from 'vitest';
import {
	parseSdoc,
	parseArgsLiteral,
	slugifyTitle,
	normalizeBody,
	type ShowcaseEntity,
	type PageEntity,
} from '../../src/lib/language/parser.js';
import type { ScanError } from '../../src/lib/language/scanner.js';

function diagnosticCodes(source: string): string[] {
	return parseSdoc(source).diagnostics.map((d) => d.code);
}

describe('parseSdoc typed entities', () => {
	const source = `<script>
	import Tabs from './Tabs.svelte';
	import Tab from './Tab.svelte';
</script>

[SHOWCASE title="Navigation / Tabs" description="A tab bar."]

	[preview component={Tabs} args={{ active: 0 }}]
		<Tabs {...args}><Tab label="One">…</Tab></Tabs>
	[/preview]

	[preview component={Tab} args={{ label: 'One' }}]
		<Tabs><Tab {...args}>…</Tab></Tabs>
	[/preview]

	[example title="Vertical"]
		<Tabs vertical />
	[/example]

[/SHOWCASE]
`;
	const doc = parseSdoc(source);
	const docs = doc.entities[0] as ShowcaseEntity;

	it('parses without diagnostics', () => {
		expect(doc.diagnostics).toEqual([]);
	});

	it('types the SHOWCASE entity', () => {
		expect(docs.kind).toBe('SHOWCASE');
		expect(docs.title).toBe('Navigation / Tabs');
		expect(docs.slug).toBe('navigation-tabs');
		expect(docs.description).toBe('A tab bar.');
	});

	it('collects previews with component names, own args, and labels', () => {
		expect(docs.previews).toHaveLength(2);
		expect(docs.previews[0]).toMatchObject({
			componentName: 'Tabs',
			args: { active: 0 },
			label: 'Tabs',
		});
		expect(docs.previews[1]).toMatchObject({
			componentName: 'Tab',
			args: { label: 'One' },
			label: 'Tab',
		});
	});

	it('collects examples', () => {
		expect(docs.examples).toHaveLength(1);
		expect(docs.examples[0].title).toBe('Vertical');
		expect(docs.examples[0].body).toContain('<Tabs vertical />');
	});

	it('uses title= as the tab label override', () => {
		const overridden = parseSdoc(
			`[SHOWCASE title="X"]
[preview component={Button} title="As a link" args={{ a: 1 }}]
x
[/preview]
[preview component={Button}]
x
[/preview]
[/SHOWCASE]
`,
		);
		const entity = overridden.entities[0] as ShowcaseEntity;
		expect(entity.previews.map((p) => p.label)).toEqual(['As a link', 'Button']);
		expect(overridden.diagnostics).toEqual([]);
	});
});

describe('parseSdoc validation', () => {
	it('requires entity titles', () => {
		expect(diagnosticCodes('[SHOWCASE]\n[/SHOWCASE]\n')).toContain('missing-attr');
		expect(diagnosticCodes('[DOC]\nx\n[/DOC]\n')).toContain('missing-attr');
	});

	it('requires component on previews and title on examples', () => {
		expect(diagnosticCodes('[SHOWCASE title="X"]\n[preview]\nx\n[/preview]\n[/SHOWCASE]\n')).toContain(
			'missing-attr',
		);
		expect(diagnosticCodes('[SHOWCASE title="X"]\n[example]\nx\n[/example]\n[/SHOWCASE]\n')).toContain(
			'missing-attr',
		);
	});

	it('rejects unknown attributes', () => {
		expect(diagnosticCodes('[SHOWCASE title="X" component={B}]\n[/SHOWCASE]\n')).toContain('unknown-attr');
		expect(diagnosticCodes('[DOC title="X" bogus="4px"]\nx\n[/DOC]\n')).toContain(
			'unknown-attr',
		);
	});

	it('parses slug and the bare hide flag on entities', () => {
		const doc = parseSdoc('[DOC title="Intro" slug="intro-page" hide]\nx\n[/DOC]\n');
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0]).toMatchObject({ routeSlug: 'intro-page', hide: true });
		const plain = parseSdoc('[LAYOUT title="L"]\nx\n[/LAYOUT]\n');
		expect(plain.entities[0]).toMatchObject({ routeSlug: null, hide: false });
	});

	it('rejects malformed slug values', () => {
		const doc = parseSdoc('[DOC title="Intro" slug="Not OK"]\nx\n[/DOC]\n');
		expect(doc.diagnostics.map((d) => d.code)).toContain('invalid-slug');
	});

	it('rejects wrong attribute value kinds', () => {
		expect(diagnosticCodes('[SHOWCASE title={x}]\n[/SHOWCASE]\n')).toContain('attr-value-kind');
		expect(
			diagnosticCodes('[SHOWCASE title="X"]\n[preview component="Button"]\nx\n[/preview]\n[/SHOWCASE]\n'),
		).toContain('attr-value-kind');
	});

	it('rejects non-identifier component expressions', () => {
		expect(
			diagnosticCodes(
				'[SHOWCASE title="X"]\n[preview component={Tabs.Tab}]\nx\n[/preview]\n[/SHOWCASE]\n',
			),
		).toContain('component-identifier');
	});

	it('rejects duplicate example titles and preview labels', () => {
		expect(
			diagnosticCodes(
				'[SHOWCASE title="X"]\n[example title="A"]\nx\n[/example]\n[example title="A"]\ny\n[/example]\n[/SHOWCASE]\n',
			),
		).toContain('duplicate-example-title');
		expect(
			diagnosticCodes(
				'[SHOWCASE title="X"]\n[preview component={B}]\nx\n[/preview]\n[preview component={B}]\ny\n[/preview]\n[/SHOWCASE]\n',
			),
		).toContain('duplicate-preview-label');
	});

	it('rejects colliding entity addresses in one file', () => {
		expect(
			diagnosticCodes('[DOC title="A B"]\nx\n[/DOC]\n[DOC title="A / B"]\ny\n[/DOC]\n'),
		).toContain('duplicate-entity-title');
	});

	it('accepts LAYOUT presentation attributes', () => {
		const doc = parseSdoc('[LAYOUT title="Login" padding="48px"]\n<div />\n[/LAYOUT]\n');
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0]).toMatchObject({
			kind: 'LAYOUT',
			sizing: { maxWidth: null, padding: '48px' },
		});
	});
});

describe('parseArgsLiteral', () => {
	function parse(raw: string) {
		const diagnostics: ScanError[] = [];
		const values = parseArgsLiteral(raw, { start: 0, end: raw.length }, diagnostics);
		return { values, messages: diagnostics.map((d) => d.message) };
	}

	it('parses flat literals of all three types', () => {
		expect(parse(`{ label: 'Hi', size: 14, wide: true, off: false, neg: -0.5 }`).values).toEqual({
			label: 'Hi',
			size: 14,
			wide: true,
			off: false,
			neg: -0.5,
		});
	});

	it('parses empty objects, quoted keys, and escaped strings', () => {
		expect(parse('{}').values).toEqual({});
		expect(parse(`{ "data-x": 'a', b: "it\\'s" }`).values).toEqual({ 'data-x': 'a', b: "it's" });
	});

	it('rejects nested values and identifiers with a pointer to the body', () => {
		expect(parse(`{ items: [1, 2] }`).values).toBeNull();
		expect(parse(`{ obj: { a: 1 } }`).values).toBeNull();
		const { values, messages } = parse(`{ icon: MyIcon }`);
		expect(values).toBeNull();
		expect(messages[0]).toContain('plain literal');
	});

	it('rejects malformed objects', () => {
		expect(parse(`plain`).values).toBeNull();
		expect(parse(`{ a: 1 b: 2 }`).values).toBeNull();
		expect(parse(`{ a: 1 } extra`).values).toBeNull();
	});
});

describe('normalizeBody', () => {
	it('strips the common indentation but keeps relative indent', () => {
		expect(normalizeBody('\n\t\t<div>\n\t\t\t<b>x</b>\n\t\t</div>\n')).toBe(
			'<div>\n\t<b>x</b>\n</div>',
		);
	});

	it('ignores blank lines when computing the indent and blanks them out', () => {
		expect(normalizeBody('\t\ta\n\n\t\tb\n')).toBe('a\n\nb');
	});

	it('unescapes body lines that start with \\[', () => {
		expect(normalizeBody('\t\\[example title="x"]\n\ttext\n')).toBe(
			'[example title="x"]\ntext',
		);
	});

	it('dedents PAGE bodies so markdown does not become code blocks', () => {
		const doc = parseSdoc('[DOC title="X"]\n\t## Heading\n\n\ttext\n[/DOC]\n');
		expect((doc.entities[0] as PageEntity).body).toBe('## Heading\n\ntext');
	});
});

describe('slugifyTitle', () => {
	it('slugifies title paths', () => {
		expect(slugifyTitle('Forms / Button')).toBe('forms-button');
		expect(slugifyTitle('  Weird -- Title!! ')).toBe('weird-title');
		expect(slugifyTitle('')).toBe('untitled');
	});
});
