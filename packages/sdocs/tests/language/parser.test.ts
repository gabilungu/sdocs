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
			'example-title-required',
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

describe('block-level scripts: parsed fields and duplicate-import rule', () => {
	it('exposes script/style/markup on preview and example blocks', () => {
		const doc = parseSdoc(`<script lang="ts">
	import Nav from './Nav.svelte';
</script>

[SHOWCASE title="Nav"]

	[preview component={Nav}]
		<script lang="ts">
			let active = $state('Home');
		</script>
		<Nav {active} />
	[/preview]

	[example title="Styled"]
		<span class="big">hi</span>
		<style>
			.big { font-size: 2em; }
		</style>
	[/example]

[/SHOWCASE]
`);
		expect(doc.diagnostics).toEqual([]);
		const showcase = doc.entities[0] as ShowcaseEntity;
		expect(showcase.previews[0].script?.content).toContain('$state');
		expect(showcase.previews[0].markup).toBe('<Nav {active} />');
		expect(showcase.previews[0].body).toContain('<script lang="ts">');
		expect(showcase.examples[0].style?.content).toContain('.big');
		expect(showcase.examples[0].markup).toBe('<span class="big">hi</span>');
	});

	it('errors when a block script re-imports a file-script identifier', () => {
		const codes = diagnosticCodes(`<script lang="ts">
	import Nav from './Nav.svelte';
	import { helper } from './utils.js';
</script>

[SHOWCASE title="Nav"]

	[example title="Dup"]
		<script lang="ts">
			import Nav from './Nav.svelte';
		</script>
		<Nav />
	[/example]

[/SHOWCASE]
`);
		expect(codes).toContain('duplicate-import');
	});

	it('allows block imports of new identifiers, aliases, and other modules', () => {
		const codes = diagnosticCodes(`<script lang="ts">
	import Nav from './Nav.svelte';
</script>

[SHOWCASE title="Nav"]

	[example title="Fresh"]
		<script lang="ts">
			import Badge from './Badge.svelte';
			import { helper as navHelper } from './utils.js';
		</script>
		<Nav /><Badge />
	[/example]

[/SHOWCASE]
`);
		expect(codes).not.toContain('duplicate-import');
	});

	it('catches named-import and alias collisions', () => {
		const codes = diagnosticCodes(`<script lang="ts">
	import { helper } from './utils.js';
</script>

[SHOWCASE title="X"]

	[example title="Alias"]
		<script>
			import { other as helper } from './elsewhere.js';
		</script>
		<b>{helper()}</b>
	[/example]

[/SHOWCASE]
`);
		expect(codes).toContain('duplicate-import');
	});
});

describe('parser: reserved names and comment scrubbing (review regressions)', () => {
	it('flags a block script declaring args or __sdocsRef', () => {
		const codes = diagnosticCodes(`[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\tlet args = {};\n\t\t</script>\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`);
		expect(codes).toContain('reserved-name');
	});

	it('a commented-out import never triggers duplicate-import', () => {
		const codes = diagnosticCodes(`<script>\n\timport Nav from './Nav.svelte';\n</script>\n\n[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\t// import Nav from './Nav.svelte';\n\t\t\tconst n = 1;\n\t\t</script>\n\t\t<Nav>{n}</Nav>\n\t[/example]\n[/SHOWCASE]\n`);
		expect(codes).not.toContain('duplicate-import');
	});
});

describe('description attribute + example-title enforcement', () => {
	it('parses description on previews and examples', () => {
		const doc = parseSdoc(`<script>
	import X from './X.svelte';
</script>

[SHOWCASE title="X"]
	[preview component={X} description="How you use it"]
		<X />
	[/preview]
	[example title="A" description="What it shows"]
		<X />
	[/example]
[/SHOWCASE]
`);
		expect(doc.diagnostics).toEqual([]);
		const sc = doc.entities[0] as ShowcaseEntity;
		expect(sc.previews[0].description).toBe('How you use it');
		expect(sc.examples[0].description).toBe('What it shows');
	});

	it('a missing example title gets the dedicated diagnostic code', () => {
		const codes = diagnosticCodes(`[SHOWCASE title="X"]
	[example]
		<b>x</b>
	[/example]
[/SHOWCASE]
`);
		expect(codes).toContain('example-title-required');
	});
});

describe('reserved names by entity kind (review regression)', () => {
	it('a PAGE entity script may declare args — no stage wrapper there', () => {
		const codes = diagnosticCodes(
			`[PAGE title="P"]\n\t<script>\n\t\tconst args = { a: 1 };\n\t</script>\n\t<b>{args.a}</b>\n[/PAGE]\n`,
		);
		expect(codes).not.toContain('reserved-name');
	});

	it('a SHOWCASE entity script declaring args still errors', () => {
		const codes = diagnosticCodes(
			`[SHOWCASE title="X"]\n\t<script>\n\t\tconst args = {};\n\t</script>\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`,
		);
		expect(codes).toContain('reserved-name');
	});

	it('a LAYOUT entity script declaring args still errors — layouts render in the stage iframe', () => {
		const codes = diagnosticCodes(
			`[LAYOUT title="L"]\n\t<script>\n\t\tlet args = {};\n\t</script>\n\t<b>x</b>\n[/LAYOUT]\n`,
		);
		expect(codes).toContain('reserved-name');
	});

	it('a PAGE entity script re-importing a file identifier still errors', () => {
		const codes = diagnosticCodes(
			`<script>\n\timport Nav from './Nav.svelte';\n</script>\n\n[PAGE title="P"]\n\t<script>\n\t\timport Nav from './Nav.svelte';\n\t</script>\n\t<Nav />\n[/PAGE]\n`,
		);
		expect(codes).toContain('duplicate-import');
	});
});

describe('entity-level scripts: fields and scope chain', () => {
	it('exposes entity script/style on all entity kinds', () => {
		const doc = parseSdoc(`[SHOWCASE title="X"]
	<script>
		const shared = 1;
	</script>
	[example title="A"]
		<b>{shared}</b>
	[/example]
	<style>
		.s { color: red; }
	</style>
[/SHOWCASE]

[PAGE title="P"]
	<script>
		let open = $state(false);
	</script>
	<b>{open}</b>
[/PAGE]
`);
		expect(doc.diagnostics).toEqual([]);
		const sc = doc.entities[0] as ShowcaseEntity;
		expect(sc.script?.content).toContain('const shared');
		expect(sc.style?.content).toContain('.s {');
		const pg = doc.entities[1] as PageEntity;
		expect(pg.script?.content).toContain('$state(false)');
		expect(pg.body).toBe('<b>{open}</b>');
	});

	it('an entity script re-importing a file identifier errors', () => {
		const codes = diagnosticCodes(`<script>
	import Nav from './Nav.svelte';
</script>

[SHOWCASE title="X"]
	<script>
		import Nav from './Nav.svelte';
	</script>
	[example title="A"]
		<Nav />
	[/example]
[/SHOWCASE]
`);
		expect(codes).toContain('duplicate-import');
	});

	it('a block script re-importing an ENTITY-script identifier errors', () => {
		const codes = diagnosticCodes(`[SHOWCASE title="X"]
	<script>
		import Badge from './Badge.svelte';
	</script>
	[example title="A"]
		<script>
			import Badge from './Badge.svelte';
		</script>
		<Badge />
	[/example]
[/SHOWCASE]
`);
		expect(codes).toContain('duplicate-import');
	});
});
