import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureCoverage } from '../../src/lib/server/coverage.js';
import { resolveConfig } from '../../src/lib/server/config.js';

const COMPONENT = `<script lang="ts">
	let { label = 'hi' } = $props();
</script>

<span>{label}</span>
`;

let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'sdocs-coverage-'));
	mkdirSync(join(dir, 'lib'), { recursive: true });
	// Three components: two documented, one not.
	writeFileSync(join(dir, 'lib/Button.svelte'), COMPONENT);
	writeFileSync(join(dir, 'lib/Input.svelte'), COMPONENT);
	writeFileSync(join(dir, 'lib/Forgotten.svelte'), COMPONENT);
	// A compound family: index module + root + member.
	writeFileSync(join(dir, 'lib/Tree.svelte'), COMPONENT);
	writeFileSync(join(dir, 'lib/TreeItem.svelte'), COMPONENT);
	writeFileSync(
		join(dir, 'lib/index.ts'),
		"import Root from './Tree.svelte';\nimport Item from './TreeItem.svelte';\nconst Tree = Object.assign(Root, { Item });\nexport { Tree, Item };\nexport default Tree;\n",
	);

	writeFileSync(
		join(dir, 'lib/Button.sdoc'),
		`<script lang="ts">
	import Button from './Button.svelte';
</script>

[SHOWCASE title="Button"]
	[component component={Button}]
		<Button />
	[/component]
[/SHOWCASE]
`,
	);
	writeFileSync(
		join(dir, 'lib/Input.sdoc'),
		`<script lang="ts">
	import Input from './Input.svelte';
</script>

[SHOWCASE title="Input"]
	[component component={Input}]
		<Input />
	[/component]
[/SHOWCASE]
`,
	);
	// A compound family in ONE file: two previews, two different components.
	writeFileSync(
		join(dir, 'lib/Tree.sdoc'),
		`<script lang="ts">
	import Tree from './index.js';
</script>

[SHOWCASE title="Tree"]
	[component component={Tree}]
		<Tree />
	[/component]

	[component component={Tree.Item}]
		<Tree.Item />
	[/component]
[/SHOWCASE]
`,
	);
});

const docs = () =>
	['lib/Button.sdoc', 'lib/Input.sdoc', 'lib/Tree.sdoc'].map((f) => join(dir, f));

describe('measureCoverage', () => {
	it('separates documented components from undocumented ones', async () => {
		const result = await measureCoverage(docs(), [join(dir, '**/*.svelte')], dir);
		expect(result.counts.components).toBe(5);
		expect(result.undocumented).toEqual(['lib/Forgotten.svelte']);
		expect(result.counts.documented).toBe(4);
	});

	it('measures a compound family per sub-component', async () => {
		const result = await measureCoverage(docs(), [join(dir, '**/*.svelte')], dir);
		const documented = result.documented.map((d) => d.component);
		// The root and the member each resolve to their own file.
		expect(documented).toContain('lib/Tree.svelte');
		expect(documented).toContain('lib/TreeItem.svelte');
		// Both live in one .sdoc, which is a supported pattern — not a duplicate.
		expect(result.multiplyDocumented).toEqual([]);
	});

	it('records where each component is documented', async () => {
		const result = await measureCoverage(docs(), [join(dir, '**/*.svelte')], dir);
		const button = result.documented.find((d) => d.component === 'lib/Button.svelte');
		expect(button?.sites).toEqual([
			{ file: 'lib/Button.sdoc', entity: 'Button', stage: 'Button', component: 'Button' },
		]);
	});

	it('flags a component documented from more than one file', async () => {
		const extra = join(dir, 'lib/ButtonAgain.sdoc');
		writeFileSync(
			extra,
			`<script lang="ts">
	import Button from './Button.svelte';
</script>

[SHOWCASE title="Button again"]
	[component component={Button}]
		<Button />
	[/component]
[/SHOWCASE]
`,
		);
		const result = await measureCoverage([...docs(), extra], [join(dir, '**/*.svelte')], dir);
		expect(result.multiplyDocumented).toEqual([
			{ component: 'lib/Button.svelte', files: ['lib/Button.sdoc', 'lib/ButtonAgain.sdoc'] },
		]);
	});

	it('reports a component reference that resolves to no file', async () => {
		const broken = join(dir, 'lib/Ghost.sdoc');
		writeFileSync(
			broken,
			`<script lang="ts">
	import Ghost from './Ghost.svelte';
</script>

[SHOWCASE title="Ghost"]
	[component component={Ghost}]
		<Ghost />
	[/component]
[/SHOWCASE]
`,
		);
		const result = await measureCoverage([broken], [join(dir, '**/*.svelte')], dir);
		expect(result.unresolved).toEqual([
			{ file: 'lib/Ghost.sdoc', entity: 'Ghost', stage: 'Ghost', component: 'Ghost' },
		]);
	});

	it('reports documented components that fall outside the globs', async () => {
		// Narrow the glob so Button.svelte is documented but unmatched.
		const result = await measureCoverage(docs(), [join(dir, '**/Input.svelte')], dir);
		expect(result.counts.components).toBe(1);
		expect(result.documentedOutsideGlobs).toContain('lib/Button.svelte');
	});
});

describe('the components config option', () => {
	it('defaults to the include globs with .sdoc swapped for .svelte', () => {
		const config = resolveConfig({ include: ['./src/**/*.sdoc', './docs/**/*.sdoc'] });
		expect(config.components).toEqual(['./src/**/*.svelte', './docs/**/*.svelte']);
	});

	it('takes an explicit glob, as a string or an array', () => {
		expect(resolveConfig({ components: './lib/**/*.svelte' }).components).toEqual([
			'./lib/**/*.svelte',
		]);
		expect(resolveConfig({ components: ['./a/*.svelte', './b/*.svelte'] }).components).toEqual([
			'./a/*.svelte',
			'./b/*.svelte',
		]);
	});
});
