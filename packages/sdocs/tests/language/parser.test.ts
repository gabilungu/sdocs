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

describe('tags and synonyms', () => {
	const parse = (opener: string, block = 'example') =>
		parseSdoc(
			[
				'<script>',
				"\timport Badge from './Badge.svelte';",
				'</script>',
				'',
				'[SHOWCASE title="Display / Badge"]',
				`\t[${opener}]`,
				'\t\t<Badge />',
				`\t[/${block}]`,
				'[/SHOWCASE]',
			].join('\n'),
		);

	it('reads an example\'s tags as a list', () => {
		const doc = parse('example title="Menu" tags="user menu, badge"');
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as ShowcaseEntity;
		expect(entity.examples[0].tags).toEqual(['user menu', 'badge']);
	});

	it("reads a component's synonyms as a list", () => {
		const doc = parse('component component={Badge} synonyms="pill, chip"', 'component');
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as ShowcaseEntity;
		expect(entity.previews[0].synonyms).toEqual(['pill', 'chip']);
	});

	it('is an empty list when the attribute is absent', () => {
		const doc = parse('example title="Menu"');
		const entity = doc.entities[0] as ShowcaseEntity;
		expect(entity.examples[0].tags).toEqual([]);
	});

	it('forgives the spacing, a trailing comma, and a repeat', () => {
		const doc = parse('example title="Menu" tags="  user menu ,badge,  , badge "');
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as ShowcaseEntity;
		expect(entity.examples[0].tags).toEqual(['user menu', 'badge']);
	});

	it('keeps each attribute to the block that owns it', () => {
		// synonyms belongs to [component], tags to [example] — crossing them is
		// an unknown attribute, not a silent no-op.
		expect(parse('example title="Menu" synonyms="pill"').diagnostics.map((d) => d.code)).toEqual([
			'unknown-attr',
		]);
		expect(
			parse('component component={Badge} tags="pill"', 'component').diagnostics.map((d) => d.code),
		).toEqual(['unknown-attr']);
	});
});

describe('example code panel', () => {
	const parse = (opener: string) =>
		parseSdoc(
			[
				'<script>',
				"\timport Badge from './Badge.svelte';",
				'</script>',
				'',
				'[SHOWCASE title="Badge"]',
				`\t[${opener}]`,
				'\t\t<Badge />',
				'\t[/example]',
				'[/SHOWCASE]',
			].join('\n'),
		);
	const example = (doc: ReturnType<typeof parseSdoc>) =>
		(doc.entities[0] as ShowcaseEntity).examples[0];

	it('shows the code by default', () => {
		const doc = parse('example title="One"');
		expect(doc.diagnostics).toEqual([]);
		expect(example(doc).showCode).toBe(true);
	});

	it('hides it on code="false"', () => {
		const doc = parse('example title="One" code="false"');
		expect(doc.diagnostics).toEqual([]);
		expect(example(doc).showCode).toBe(false);
	});

	it('accepts code="true" as the default said out loud', () => {
		const doc = parse('example title="One" code="true"');
		expect(doc.diagnostics).toEqual([]);
		expect(example(doc).showCode).toBe(true);
	});

	it('reports a value that is neither, rather than reading it as false', () => {
		// A typo that silently hid the code would look like a decision.
		const doc = parse('example title="One" code="flase"');
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['example-code']);
		expect(example(doc).showCode).toBe(true);
	});

	it('is not an attribute of [component]', () => {
		const doc = parseSdoc(
			[
				'<script>',
				"\timport Badge from './Badge.svelte';",
				'</script>',
				'',
				'[SHOWCASE title="Badge"]',
				'\t[component component={Badge} code="false"]',
				'\t\t<Badge />',
				'\t[/component]',
				'[/SHOWCASE]',
			].join('\n'),
		);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['unknown-attr']);
	});
});

describe('notes', () => {
	const entity = (body: string[]) =>
		parseSdoc(['[DOC title="X"]', ...body, '[/DOC]', ''].join('\n'));

	it('reads a typed note and a plain one', () => {
		const doc = entity(['\t[NOTES]', '\t\t- wip: Being rewritten.', '\t\t- Plain.', '\t[/NOTES]']);
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0].notes).toEqual([
			{ note: 'Being rewritten.', type: 'wip' },
			{ note: 'Plain.', type: null },
		]);
	});

	it('is empty when there is no block', () => {
		expect(entity(['\tHello.']).entities[0].notes).toEqual([]);
	});

	it('rejects a type it does not know', () => {
		// Silently dropping the type would render grey — a real status of its
		// own — so a typo would read as a deliberate choice.
		const doc = entity(['\t[NOTES]', '\t\t- critical: Hi', '\t[/NOTES]']);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['note-type']);
	});

	it('rejects a line that is not a note', () => {
		const doc = entity(['\t[NOTES]', '\t\tjust prose', '\t[/NOTES]']);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['note-line']);
	});

	it('rejects a second block rather than picking one', () => {
		const doc = entity([
			'\t[NOTES]', '\t\t- One', '\t[/NOTES]',
			'\t[NOTES]', '\t\t- Two', '\t[/NOTES]',
		]);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['duplicate-block']);
	});
});

describe('todos', () => {
	const entity = (body: string[]) =>
		parseSdoc(['[DOC title="X"]', ...body, '[/DOC]', ''].join('\n'));

	it('nests by indentation, to any depth', () => {
		const doc = entity([
			'\t[TODO]',
			'\t\t- [ ] one',
			'\t\t\t- [x] two',
			'\t\t\t\t- [ ] three',
			'\t\t- [x] four',
			'\t[/TODO]',
		]);
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0].todos).toEqual([
			{ text: 'one', done: false, children: [
				{ text: 'two', done: true, children: [
					{ text: 'three', done: false, children: [] },
				]},
			]},
			{ text: 'four', done: true, children: [] },
		]);
	});

	it('takes an upper-case X as done', () => {
		const doc = entity(['\t[TODO]', '\t\t- [X] done', '\t[/TODO]']);
		expect(doc.entities[0].todos[0].done).toBe(true);
	});

	it('rejects a line that is not a task', () => {
		const doc = entity(['\t[TODO]', '\t\t- no checkbox', '\t[/TODO]']);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['todo-line']);
	});
});

describe('parseSdoc typed entities', () => {
	const source = `<script>
	import Tabs from './Tabs.svelte';
	import Tab from './Tab.svelte';
</script>

[SHOWCASE title="Navigation / Tabs" description="A tab bar."]

	[component component={Tabs} args={{ active: 0 }}]
		<Tabs {...args}><Tab label="One">…</Tab></Tabs>
	[/component]

	[component component={Tab} args={{ label: 'One' }}]
		<Tabs><Tab {...args}>…</Tab></Tabs>
	[/component]

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
[component component={Button} title="As a link" args={{ a: 1 }}]
x
[/component]
[component component={Button}]
x
[/component]
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
		expect(diagnosticCodes('[SHOWCASE title="X"]\n[component]\nx\n[/component]\n[/SHOWCASE]\n')).toContain(
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
			diagnosticCodes('[SHOWCASE title="X"]\n[component component="Button"]\nx\n[/component]\n[/SHOWCASE]\n'),
		).toContain('attr-value-kind');
	});

	it('rejects non-identifier component expressions', () => {
		expect(
			diagnosticCodes(
				'[SHOWCASE title="X"]\n[component component={makeTab()}]\nx\n[/component]\n[/SHOWCASE]\n',
			),
		).toContain('component-identifier');
	});

	it('accepts member access for compound components', () => {
		const doc = parseSdoc(
			'[SHOWCASE title="X"]\n[component component={NavTree.Group}]\nx\n[/component]\n[/SHOWCASE]\n',
		);
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as ShowcaseEntity;
		expect(entity.previews[0].componentName).toBe('NavTree.Group');
	});

	it('rejects duplicate example titles and preview labels', () => {
		expect(
			diagnosticCodes(
				'[SHOWCASE title="X"]\n[example title="A"]\nx\n[/example]\n[example title="A"]\ny\n[/example]\n[/SHOWCASE]\n',
			),
		).toContain('duplicate-example-title');
		expect(
			diagnosticCodes(
				'[SHOWCASE title="X"]\n[component component={B}]\nx\n[/component]\n[component component={B}]\ny\n[/component]\n[/SHOWCASE]\n',
			),
		).toContain('duplicate-preview-label');
	});

	it('rejects colliding entity addresses in one file', () => {
		expect(
			diagnosticCodes('[DOC title="A B"]\nx\n[/DOC]\n[DOC title="A / B"]\ny\n[/DOC]\n'),
		).toContain('duplicate-entity-title');
	});

	it('accepts LAYOUT presentation attributes', () => {
		const doc = parseSdoc(
			'[LAYOUT title="Login" padding="48px" background="var(--base-100)" minHeight="100vh"]\n<div />\n[/LAYOUT]\n',
		);
		expect(doc.diagnostics).toEqual([]);
		expect(doc.entities[0]).toMatchObject({
			kind: 'LAYOUT',
			sizing: {
				maxWidth: null,
				padding: '48px',
				background: 'var(--base-100)',
				minHeight: '100vh',
			},
		});
	});

	it('rejects flex stage attributes on LAYOUT — its body stays flow-root', () => {
		const doc = parseSdoc('[LAYOUT title="L" direction="row"]\nx\n[/LAYOUT]\n');
		expect(doc.diagnostics.length).toBeGreaterThan(0);
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

	it('parses null (nullable props like duration: null), keeping the rest of the object', () => {
		expect(parse(`{ duration: null, title: 'Hi', showProgress: false }`).values).toEqual({
			duration: null,
			title: 'Hi',
			showProgress: false,
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

	it('unescapes \\[ at any indentation depth, preserving the indent (review regression F7)', () => {
		expect(normalizeBody('\t\\[outer]\n\t\t\\[deeper]\n\t\t\t\\[deepest]\n')).toBe(
			'[outer]\n\t[deeper]\n\t\t[deepest]',
		);
	});

	it('keeps mid-line backslash-bracket text untouched', () => {
		expect(normalizeBody('\ta \\[not a tag]\n')).toBe('a \\[not a tag]');
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

	[component component={Nav}]
		<script lang="ts">
			let active = $state('Home');
		</script>
		<Nav {active} />
	[/component]

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
	[component component={X} description="How you use it"]
		<X />
	[/component]
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

describe('reserved names: file script (review regression F1)', () => {
	it('flags a file script declaring args — it is lifted into every stage iframe', () => {
		const codes = diagnosticCodes(
			`<script>\n\tconst args = { shared: true };\n</script>\n\n[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`,
		);
		expect(codes).toContain('reserved-name');
	});

	it('flags a file script declaring __sdocsRef or __sdocsExample', () => {
		expect(
			diagnosticCodes(`<script>\n\tlet __sdocsRef = null;\n</script>\n\n[PAGE title="P"]\n\tx\n[/PAGE]\n`),
		).toContain('reserved-name');
		expect(
			diagnosticCodes(`<script>\n\tfunction __sdocsExample() {}\n</script>\n\n[PAGE title="P"]\n\tx\n[/PAGE]\n`),
		).toContain('reserved-name');
	});

	it('flags $props() usage in a file script — the page wrapper already calls it', () => {
		const doc = parseSdoc(
			`<script>\n\tlet { data } = $props();\n</script>\n\n[PAGE title="P"]\n\tx\n[/PAGE]\n`,
		);
		const props = doc.diagnostics.find((d) => d.message.includes('$props'));
		expect(props?.code).toBe('reserved-name');
	});

	it('a clean file script stays diagnostic-free', () => {
		expect(
			diagnosticCodes(
				`<script>\n\timport Nav from './Nav.svelte';\n\tconst sizes = ['s', 'm'];\n</script>\n\n[SHOWCASE title="X"]\n\t[component component={Nav}]\n\t\t<Nav />\n\t[/component]\n[/SHOWCASE]\n`,
			),
		).toEqual([]);
	});
});

describe('reserved names: destructured bindings (review regression F1b)', () => {
	const script = (decl: string) =>
		`[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\t${decl}\n\t\t</script>\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`;

	it('flags object and array destructuring of reserved names', () => {
		expect(diagnosticCodes(script('const { args } = opts;'))).toContain('reserved-name');
		expect(diagnosticCodes(script('const [args] = lists;'))).toContain('reserved-name');
	});

	it('flags renames and rest bindings', () => {
		expect(diagnosticCodes(script('const { x: args } = opts;'))).toContain('reserved-name');
		expect(diagnosticCodes(script('let { ...args } = opts;'))).toContain('reserved-name');
		expect(diagnosticCodes(script('const { a: { b: __sdocsRef } } = opts;'))).toContain(
			'reserved-name',
		);
	});

	it('a reserved name used in a destructuring default is a use, not a binding', () => {
		expect(diagnosticCodes(script('const { extra = args } = opts;'))).not.toContain(
			'reserved-name',
		);
	});

	it('reserved-shaped text in comments or strings never fires', () => {
		expect(diagnosticCodes(script('// let args = 1;\nconst ok = 2;'))).not.toContain(
			'reserved-name',
		);
		expect(diagnosticCodes(script("const sample = 'let args = 1;';"))).not.toContain(
			'reserved-name',
		);
	});

	it('longer names sharing the prefix stay allowed', () => {
		expect(diagnosticCodes(script('const argsList = [];'))).not.toContain('reserved-name');
	});
});

describe('reserved names: page wrapper (review regression F2)', () => {
	it('flags a PAGE entity script using $props()', () => {
		expect(
			diagnosticCodes(
				`[PAGE title="P"]\n\t<script>\n\t\tlet { data } = $props();\n\t</script>\n\t<b>{data}</b>\n[/PAGE]\n`,
			),
		).toContain('reserved-name');
	});

	it('flags a DOC entity script declaring __sdocsExample or using $props()', () => {
		expect(
			diagnosticCodes(
				`[DOC title="D"]\n\t<script>\n\t\tconst __sdocsExample = 1;\n\t</script>\n\tbody\n[/DOC]\n`,
			),
		).toContain('reserved-name');
		expect(
			diagnosticCodes(
				`[DOC title="D"]\n\t<script>\n\t\tconst p = $props();\n\t</script>\n\tbody\n[/DOC]\n`,
			),
		).toContain('reserved-name');
	});

	it('a DOC entity script also keeps the stage reservations — its examples run in iframes', () => {
		expect(
			diagnosticCodes(
				`[DOC title="D"]\n\t<script>\n\t\tlet args = {};\n\t</script>\n\tbody\n[/DOC]\n`,
			),
		).toContain('reserved-name');
	});

	it('SHOWCASE and LAYOUT scripts may declare __sdocsExample and use $props() — no page wrapper there', () => {
		expect(
			diagnosticCodes(
				`[SHOWCASE title="X"]\n\t<script>\n\t\tconst __sdocsExample = 1;\n\t\tconst p = $props();\n\t</script>\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`,
			),
		).not.toContain('reserved-name');
		expect(
			diagnosticCodes(
				`[LAYOUT title="L"]\n\t<script>\n\t\tconst __sdocsExample = 1;\n\t</script>\n\t<b>x</b>\n[/LAYOUT]\n`,
			),
		).not.toContain('reserved-name');
	});
});

describe('example title enforcement covers unusable values (review regression F3)', () => {
	it('a non-string example title carries the build-blocking code, once', () => {
		const diagnostics = parseSdoc(
			`[SHOWCASE title="X"]\n\t[example title={dynamic}]\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`,
		).diagnostics.filter(
			(d) => d.code === 'example-title-required' || d.code === 'attr-value-kind',
		);
		expect(diagnostics.map((d) => d.code)).toEqual(['example-title-required']);
	});

	it('wrong-kind values on rules without a dedicated code keep attr-value-kind', () => {
		expect(diagnosticCodes('[SHOWCASE title={x}]\n[/SHOWCASE]\n')).toContain('attr-value-kind');
	});
});

describe('import-shaped text inside strings (review regression F4)', () => {
	it('an import inside a template literal never triggers duplicate-import', () => {
		const codes = diagnosticCodes(
			'<script>\n\tconst sample = `\nimport Button from \'./Button.svelte\';\n`;\n</script>\n\n' +
				`[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\timport Button from './Button.svelte';\n\t\t</script>\n\t\t<Button />\n\t[/example]\n[/SHOWCASE]\n`,
		);
		expect(codes).not.toContain('duplicate-import');
	});

	it('a real duplicate next to a code sample still fires', () => {
		const codes = diagnosticCodes(
			'<script>\n\timport Button from \'./Button.svelte\';\n\tconst sample = `\nimport Other from \'./Other.svelte\';\n`;\n</script>\n\n' +
				`[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<script>\n\t\t\timport Button from './Button.svelte';\n\t\t</script>\n\t\t<Button />\n\t[/example]\n[/SHOWCASE]\n`,
		);
		expect(codes).toContain('duplicate-import');
	});
});

describe('example slug collisions (review regression F5)', () => {
	it('warns when an example slug lands on a preview slug', () => {
		const doc = parseSdoc(
			`<script>\n\timport Button from './Button.svelte';\n</script>\n\n[SHOWCASE title="X"]\n\t[component component={Button} title="X Ray"]\n\t\t<Button />\n\t[/component]\n\t[example title="Ray"]\n\t\t<Button />\n\t[/example]\n[/SHOWCASE]\n`,
		);
		const collision = doc.diagnostics.find((d) => d.code === 'example-slug-collision');
		expect(collision?.message).toContain('"Ray"');
		expect(collision?.message).toContain('"X Ray"');
		expect(collision?.message).toContain('"x-ray"');
	});

	it('warns when two distinct example titles slugify identically', () => {
		const codes = diagnosticCodes(
			`[DOC title="D"]\n\t[example title="A B"]\n\t\t<b>x</b>\n\t[/example]\n\t[example title="A-B"]\n\t\t<b>y</b>\n\t[/example]\n[/DOC]\n`,
		);
		expect(codes).toContain('example-slug-collision');
	});

	it('identical titles stay a duplicate-example-title, not a slug collision', () => {
		const codes = diagnosticCodes(
			`[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n\t[example title="A"]\n\t\t<b>y</b>\n\t[/example]\n[/SHOWCASE]\n`,
		);
		expect(codes).toContain('duplicate-example-title');
		expect(codes).not.toContain('example-slug-collision');
	});

	it('disjoint slugs stay silent', () => {
		expect(
			diagnosticCodes(
				`<script>\n\timport Button from './Button.svelte';\n</script>\n\n[SHOWCASE title="X"]\n\t[component component={Button}]\n\t\t<Button />\n\t[/component]\n\t[example title="Ray"]\n\t\t<Button />\n\t[/example]\n[/SHOWCASE]\n`,
			),
		).toEqual([]);
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

describe('[component] block', () => {
	const source = [
		'<script lang="ts">',
		"\timport Button from './Button.svelte';",
		'</script>',
		'',
		'[SHOWCASE title="B"]',
		'\t[component component={Button} args={{ label: "Hi" }}]',
		'\t\t<Button {...args} />',
		'\t[/component]',
		'[/SHOWCASE]',
		'',
	].join('\n');

	it('parses with no diagnostics', () => {
		const doc = parseSdoc(source);
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0];
		expect(entity.kind).toBe('SHOWCASE');
		if (entity.kind !== 'SHOWCASE') return;
		expect(entity.previews).toHaveLength(1);
		expect(entity.previews[0].componentName).toBe('Button');
		expect(entity.previews[0].args).toEqual({ label: 'Hi' });
	});

	it('names the [component] tag in attribute diagnostics', () => {
		const doc = parseSdoc(
			'[SHOWCASE title="B"]\n\t[component component={Button} bogus="x"]\n\t\t<Button />\n\t[/component]\n[/SHOWCASE]\n',
		);
		const messages = doc.diagnostics.map((d) => d.message).join('\n');
		expect(messages).toContain('[component]');
	});

	it('rejects the removed [preview] tag', () => {
		const doc = parseSdoc(
			'[SHOWCASE title="B"]\n\t[preview component={Button}]\n\t\t<Button />\n\t[/preview]\n[/SHOWCASE]\n',
		);
		expect(doc.diagnostics.length).toBeGreaterThan(0);
		const entity = doc.entities[0];
		if (entity.kind !== 'SHOWCASE') return;
		expect(entity.previews).toHaveLength(0);
	});

	it('is rejected outside [SHOWCASE]', () => {
		const doc = parseSdoc('[DOC title="D"]\n[component component={B}]\nx\n[/component]\n[/DOC]\n');
		expect(doc.diagnostics.map((d) => d.message).join('\n')).toContain('[component] is only valid inside [SHOWCASE]');
	});
});

describe('opener errors are reported all at once', () => {
	// The same typo three times used to cost three fix-and-revalidate rounds:
	// the scanner abandoned the file at the first bad character, so each pass
	// revealed exactly one more. Openers close with ']', but the attributes are
	// Svelte/HTML syntax and the hand finishes an HTML tag.
	const threeSlips = `[SHOWCASE title="Button"]

	[example title="Sizes" description="a">
		<Button />
	[/example]

	[example title="Tones" description="b">
		<Button />
	[/example]

	[example title="States" description="c">
		<Button />
	[/example]

[/SHOWCASE]`;

	it('reports every opener with the same mistake in one pass', () => {
		const diagnostics = parseSdoc(threeSlips).diagnostics.filter(
			(d) => d.code === 'attr-syntax',
		);
		expect(diagnostics).toHaveLength(3);
	});

	it('names the correction rather than only the symptom', () => {
		const [first] = parseSdoc(threeSlips).diagnostics;
		expect(first.message).toContain("']'");
		expect(first.message).toContain("'>'");
	});

	it('recovers the document, so the diagnostics are the only loss', () => {
		// Recovery that dropped the blocks would trade one problem for another:
		// the author would fix three typos and find their examples missing.
		const recovered = parseSdoc(threeSlips).entities[0] as ShowcaseEntity;
		const correct = parseSdoc(threeSlips.replaceAll('">', '"]'))
			.entities[0] as ShowcaseEntity;
		expect(recovered.examples.map((e) => e.name)).toEqual(
			correct.examples.map((e) => e.name),
		);
	});
});
