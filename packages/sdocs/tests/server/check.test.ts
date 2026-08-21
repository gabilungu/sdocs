import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocFile, checkDocFiles } from '../../src/lib/server/check.js';
import { buildSiteMap, collectGrammarErrors } from '../../src/lib/server/site-map.js';
import { loadConfig } from '../../src/lib/server/config.js';

/** A component the fixtures can import for real. */
const THING = `<script lang="ts">
	interface Props { label?: string }
	let { label = 'hi' }: Props = $props();
</script>

<span>{label}</span>
`;

let dir: string;
const write = (name: string, body: string) => {
	const path = join(dir, name);
	writeFileSync(path, body);
	return path;
};

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'sdocs-check-'));
	writeFileSync(join(dir, 'Thing.svelte'), THING);
});

describe('checkDocFile', () => {
	it('passes a document whose every stage compiles', async () => {
		const file = write(
			'Ok.sdoc',
			`<script lang="ts">
	import Thing from './Thing.svelte';
</script>

[SHOWCASE title="Fine"]
	[component component={Thing}]
		<Thing />
	[/component]

	[example title="With a label"]
		<Thing label="x" />
	[/example]
[/SHOWCASE]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(true);
		expect(result.problems).toEqual([]);
		// One preview + one example.
		expect(result.checked.stages).toBe(2);
	});

	it('catches a Svelte compile error inside an example, naming the stage', async () => {
		const file = write(
			'BadSyntax.sdoc',
			`<script lang="ts">
	import Thing from './Thing.svelte';
</script>

[SHOWCASE title="Broken"]
	[component component={Thing}]
		<Thing />
	[/component]

	[example title="Unclosed"]
		<div>
			<Thing />
	[/example]
[/SHOWCASE]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(false);
		const problem = result.problems.find((p) => p.kind === 'compile');
		expect(problem?.severity).toBe('error');
		expect(problem?.stage).toBe('Unclosed');
		expect(problem?.entity).toBe('Broken');
	});

	it('catches a relative import that resolves to no file', async () => {
		const file = write(
			'BadImport.sdoc',
			`<script lang="ts">
	import Missing from './DoesNotExist.svelte';
</script>

[SHOWCASE title="Broken import"]
	[component component={Missing}]
		<Missing />
	[/component]
[/SHOWCASE]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(false);
		const problem = result.problems.find((p) => p.kind === 'import');
		expect(problem?.message).toContain('./DoesNotExist.svelte');
	});

	it('never mistakes an import inside a string for a real one', async () => {
		// A code sample that *contains* import syntax must not be resolved —
		// the same rule the import rewriter follows.
		const file = write(
			'CodeSample.sdoc',
			`<script lang="ts">
	import Thing from './Thing.svelte';
	const sample = "export { sum } from './math';";
</script>

[SHOWCASE title="Sample"]
	[component component={Thing}]
		<Thing label={sample} />
	[/component]
[/SHOWCASE]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.problems.filter((p) => p.kind === 'import')).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it('resolves an import carrying a Vite query suffix', async () => {
		const file = write(
			'RawQuery.sdoc',
			`<script lang="ts">
	import Thing from './Thing.svelte';
	import raw from './Thing.svelte?raw';
</script>

[SHOWCASE title="Raw"]
	[component component={Thing}]
		<Thing label={raw} />
	[/component]
[/SHOWCASE]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.problems.filter((p) => p.kind === 'import')).toEqual([]);
	});

	it('checks a LAYOUT body and maps the error to a .sdoc line', async () => {
		const file = write(
			'BadLayout.sdoc',
			`[LAYOUT title="Broken layout"]
	<div>{#if}</div>
[/LAYOUT]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(false);
		const problem = result.problems.find((p) => p.kind === 'compile');
		expect(problem?.stage).toBe('body');
		expect(problem?.line).toBe(2);
	});

	it('reports a component={…} that resolves to no component file', async () => {
		const file = write(
			'BadComponent.sdoc',
			`<script lang="ts">
	import Thing from './Thing.svelte';
</script>

[SHOWCASE title="Typo"]
	[component component={Thnig}]
		<Thing />
	[/component]
[/SHOWCASE]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(false);
		const problem = result.problems.find((p) => p.kind === 'component');
		expect(problem?.severity).toBe('error');
		expect(problem?.message).toContain('Thnig');
		expect(problem?.stage).toBe('Thnig');
	});

	it('reports grammar diagnostics too', async () => {
		const file = write('BadGrammar.sdoc', '[SHOWCASE title="X" nope="y"]\n[/SHOWCASE]\n');
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(false);
		expect(result.problems.some((p) => p.kind === 'grammar' && p.code === 'unknown-attr')).toBe(
			true,
		);
	});

	it('checks a DOC body and its examples', async () => {
		const file = write(
			'Guide.sdoc',
			`<script lang="ts">
	import Thing from './Thing.svelte';
</script>

[DOC title="Guide"]

	## Heading

	Prose with \`code\`.

	[example title="Demo"]
		<Thing />
	[/example]

[/DOC]
`,
		);
		const result = await checkDocFile(file, dir);
		expect(result.ok).toBe(true);
		// The prose body plus the example.
		expect(result.checked.stages).toBe(2);
	});
});

describe('checkDocFiles', () => {
	it('merges results and fails when any file fails', async () => {
		const good = join(dir, 'Ok.sdoc');
		const bad = join(dir, 'BadImport.sdoc');
		const result = await checkDocFiles([good, bad], dir);
		expect(result.ok).toBe(false);
		expect(result.checked.files).toBe(2);
		expect(result.problems.some((p) => p.file === 'BadImport.sdoc')).toBe(true);
	});
});

/**
 * `sdocs check` is the command CI is told to run, and it used to see only half
 * the problems: it compiled every stage but never built the section map, so an
 * unknown `@section`, two entities on one route, or a `home` pointing nowhere
 * passed `check` and then failed `build`. Both now read the same map.
 */
describe('site structure', () => {
	const project = (config: string, files: Record<string, string>) => {
		const root = mkdtempSync(join(tmpdir(), 'sdocs-structure-'));
		writeFileSync(join(root, 'sdocs.config.js'), config);
		for (const [name, body] of Object.entries(files)) {
			writeFileSync(join(root, name), body);
		}
		return root;
	};

	it('reports a title claiming a section that was never declared', async () => {
		const root = project(
			"export default { include: ['./*.sdoc'], sections: [{ slug: 'guides' }] };\n",
			{ 'A.sdoc': '[DOC title="@nope/Alpha"]\n\n\tText.\n\n[/DOC]\n' },
		);
		const map = await buildSiteMap(await loadConfig(root), root);
		expect(map.errors.map((e) => e.message).join('\n')).toContain('@nope');
	});

	it('reports a home that resolves to no entity', async () => {
		const root = project(
			"export default { include: ['./*.sdoc'], home: 'nowhere' };\n",
			{ 'A.sdoc': '[DOC title="Alpha"]\n\n\tText.\n\n[/DOC]\n' },
		);
		const map = await buildSiteMap(await loadConfig(root), root);
		expect(map.errors.map((e) => e.message).join('\n')).toContain('home');
	});

	it('says nothing about a structure that is sound', async () => {
		const root = project("export default { include: ['./*.sdoc'], home: 'alpha' };\n", {
			'A.sdoc': '[DOC title="Alpha"]\n\n\tText.\n\n[/DOC]\n',
		});
		const map = await buildSiteMap(await loadConfig(root), root);
		expect(map.errors).toEqual([]);
	});
});

/**
 * `sdocs build` validates the structure and then lets Vite compile, so it saw
 * only what would not compile. A note type that does not exist compiles fine
 * and renders untyped; an attribute nobody reads compiles fine and does
 * nothing. Both shipped, with the build reporting success — which is the whole
 * problem, because CI usually runs `build` and not `check`.
 */
describe('grammar errors reach the build', () => {
	const project = (doc: string) => {
		const root = mkdtempSync(join(tmpdir(), 'sdocs-grammar-'));
		writeFileSync(join(root, 'sdocs.config.js'), "export default { include: ['./*.sdoc'] };\n");
		writeFileSync(join(root, 'Chip.svelte'), '<span>chip</span>\n');
		writeFileSync(join(root, 'Chip.sdoc'), doc);
		return root;
	};

	it('reports an attribute the parser does not know', async () => {
		const root = project(
			'[SHOWCASE title="Chip" nosuchattr="x"]\n\n\t[EXAMPLE title="A"]\n\t\t<span>x</span>\n\t[/EXAMPLE]\n\n[/SHOWCASE]\n',
		);
		const errors = await collectGrammarErrors(await loadConfig(root), root);
		expect(errors.join('\n')).toContain('nosuchattr');
	});

	it('reports a note type that does not exist', async () => {
		const root = project(
			'[SHOWCASE title="Chip"]\n\n\t[NOTES]\n\t\t- notatype: nope\n\t[/NOTES]\n\n\t[EXAMPLE title="A"]\n\t\t<span>x</span>\n\t[/EXAMPLE]\n\n[/SHOWCASE]\n',
		);
		const errors = await collectGrammarErrors(await loadConfig(root), root);
		expect(errors.join('\n')).toContain('notatype');
	});

	it('names the file and the line', async () => {
		const root = project(
			'[SHOWCASE title="Chip" nosuchattr="x"]\n\n\t[EXAMPLE title="A"]\n\t\t<span>x</span>\n\t[/EXAMPLE]\n\n[/SHOWCASE]\n',
		);
		const errors = await collectGrammarErrors(await loadConfig(root), root);
		expect(errors[0]).toMatch(/^Chip\.sdoc:1 — /);
	});

	it('says nothing about a file that is fine', async () => {
		const root = project(
			'[SHOWCASE title="Chip"]\n\n\t[EXAMPLE title="A"]\n\t\t<span>x</span>\n\t[/EXAMPLE]\n\n[/SHOWCASE]\n',
		);
		expect(await collectGrammarErrors(await loadConfig(root), root)).toEqual([]);
	});
});
