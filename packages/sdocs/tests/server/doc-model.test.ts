import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	extractImports,
	planEntitySnippets,
	resolveComponentImport,
} from '../../src/lib/server/doc-model.js';
import { parseSdoc } from '../../src/lib/language/parser.js';

describe('extractImports', () => {
	it('extracts real import lines, indentation included', () => {
		const script = "\timport Button from './Button.svelte';\n\tconst n = 1;";
		expect(extractImports(script)).toEqual(["import Button from './Button.svelte';"]);
	});

	it('ignores import-shaped lines inside template literals and comments (review regression F4)', () => {
		const script = [
			"import Button from './Button.svelte';",
			'const sample = `',
			"import Fake from './Fake.svelte';",
			'`;',
			"// import Commented from './C.svelte';",
			'/*',
			"import Blocked from './B.svelte';",
			'*/',
		].join('\n');
		expect(extractImports(script)).toEqual(["import Button from './Button.svelte';"]);
	});
});

describe('resolveComponentImport', () => {
	it('binds to the real import, not code-sample text', () => {
		const script = [
			'const sample = `',
			"import Button from './fake/Button.svelte';",
			'`;',
			"import Button from './real/Button.svelte';",
		].join('\n');
		const imports = extractImports(script);
		expect(resolveComponentImport('Button', imports, '/proj/src/W.sdoc')).toBe(
			'/proj/src/real/Button.svelte',
		);
	});

	it('returns null when the identifier is not imported', () => {
		expect(resolveComponentImport('Ghost', ["import X from './X.svelte';"], '/proj/W.sdoc')).toBe(
			null,
		);
	});
});

describe('resolveComponentImport — compound components (index module)', () => {
	// A real on-disk compound: index.ts re-exports the root and sub-components,
	// so the resolver has to read it and follow the bindings to the .svelte.
	let dir: string;
	let sdocPath: string;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'sdocs-compound-'));
		writeFileSync(join(dir, 'Nav.svelte'), '<nav></nav>');
		writeFileSync(join(dir, 'Group.svelte'), '<div></div>');
		writeFileSync(join(dir, 'Item.svelte'), '<a></a>');
		writeFileSync(
			join(dir, 'index.ts'),
			[
				"import Root from './Nav.svelte';",
				"import Group from './Group.svelte';",
				"import Item from './Item.svelte';",
				'const Nav = Object.assign(Root, { Group, Item });',
				'export { Nav, Group, Item };',
				'export default Nav;',
				'',
			].join('\n'),
		);
		sdocPath = join(dir, 'Nav.sdoc');
	});

	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	const imports = ["import Nav from './index.js';"];

	it("follows a bare identifier through the module's default export to the root .svelte", () => {
		expect(resolveComponentImport('Nav', imports, sdocPath)).toBe(join(dir, 'Nav.svelte'));
	});

	it('follows member access to the sub-component .svelte', () => {
		expect(resolveComponentImport('Nav.Group', imports, sdocPath)).toBe(join(dir, 'Group.svelte'));
		expect(resolveComponentImport('Nav.Item', imports, sdocPath)).toBe(join(dir, 'Item.svelte'));
	});

	it('returns null for a member the module does not export', () => {
		expect(resolveComponentImport('Nav.Missing', imports, sdocPath)).toBe(null);
	});

	it('still resolves a direct .svelte import unchanged', () => {
		expect(
			resolveComponentImport('Group', ["import Group from './Group.svelte';"], sdocPath),
		).toBe(join(dir, 'Group.svelte'));
	});
});

describe('planEntitySnippets slug uniqueness (review regression F5)', () => {
	const entityOf = (source: string) => parseSdoc(source).entities[0];

	it('keeps the preview slug and de-collides the example slug', () => {
		const entity = entityOf(
			`<script>\n\timport Button from './Button.svelte';\n</script>\n\n[SHOWCASE title="X"]\n\t[component component={Button} title="X Ray"]\n\t\t<Button />\n\t[/component]\n\t[example title="Ray"]\n\t\t<Button />\n\t[/example]\n[/SHOWCASE]\n`,
		);
		const slugs = planEntitySnippets(entity).map((s) => s.slug);
		expect(slugs).toEqual(['x-ray', 'x-ray-2']);
	});

	it('de-collides examples whose distinct titles slugify identically', () => {
		const entity = entityOf(
			`[DOC title="D"]\n\tbody\n\t[example title="A B"]\n\t\t<b>x</b>\n\t[/example]\n\t[example title="A-B"]\n\t\t<b>y</b>\n\t[/example]\n[/DOC]\n`,
		);
		const slugs = planEntitySnippets(entity).map((s) => s.slug);
		expect(slugs).toEqual(['content', 'x-a-b', 'x-a-b-2']);
	});

	it('is deterministic across repeated collisions', () => {
		const entity = entityOf(
			`[SHOWCASE title="X"]\n\t[example title="A B"]\n\t\t<b>1</b>\n\t[/example]\n\t[example title="A-B"]\n\t\t<b>2</b>\n\t[/example]\n\t[example title="A  B"]\n\t\t<b>3</b>\n\t[/example]\n[/SHOWCASE]\n`,
		);
		const slugs = planEntitySnippets(entity).map((s) => s.slug);
		expect(slugs).toEqual(['x-a-b', 'x-a-b-2', 'x-a-b-3']);
	});

	it('never yields duplicate slugs', () => {
		const sources = [
			`<script>\n\timport Button from './Button.svelte';\n</script>\n\n[SHOWCASE title="X"]\n\t[component component={Button} title="X Ray"]\n\t\t<Button />\n\t[/component]\n\t[component component={Button} title="Content"]\n\t\t<Button />\n\t[/component]\n\t[example title="Ray"]\n\t\t<Button />\n\t[/example]\n\t[example title="Ray!"]\n\t\t<Button />\n\t[/example]\n[/SHOWCASE]\n`,
			`[DOC title="D"]\n\tbody\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n\t[example title="A!"]\n\t\t<b>y</b>\n\t[/example]\n[/DOC]\n`,
			`[PAGE title="P"]\n\tx\n[/PAGE]\n`,
			`[LAYOUT title="L"]\n\tx\n[/LAYOUT]\n`,
		];
		for (const source of sources) {
			const slugs = planEntitySnippets(entityOf(source)).map((s) => s.slug);
			expect(new Set(slugs).size).toBe(slugs.length);
		}
	});
});
