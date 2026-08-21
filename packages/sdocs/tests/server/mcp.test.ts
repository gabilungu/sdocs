import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleMcpMessage, type JsonRpcResponse } from '../../src/lib/mcp/handler.js';

let nextId = 0;
async function rpc(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
	const response = await handleMcpMessage({ jsonrpc: '2.0', id: ++nextId, method, params });
	if (!response) throw new Error(`no response for ${method}`);
	return response;
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
	const response = await rpc('tools/call', { name, arguments: args });
	expect(response.error).toBeUndefined();
	return response.result as {
		content: { type: string; text: string }[];
		structuredContent?: Record<string, unknown>;
		isError?: boolean;
	};
}

const VALID_SDOC = `<script lang="ts">
	import Button from './Button.svelte';
</script>

[SHOWCASE title="Forms / Button" description="A button."]

	[component component={Button} args={{ label: 'Hi', disabled: false, duration: null }}]
		<Button {...args} />
	[/component]

[/SHOWCASE]
`;

describe('MCP handler', () => {
	it('initializes with server info and echoes a supported protocol version', async () => {
		const { result } = await rpc('initialize', {
			protocolVersion: '2025-03-26',
			capabilities: {},
			clientInfo: { name: 'test', version: '0' },
		});
		const init = result as Record<string, any>;
		expect(init.protocolVersion).toBe('2025-03-26');
		expect(init.serverInfo.name).toBe('sdocs');
		expect(init.capabilities.tools).toBeDefined();
		expect(init.instructions).toContain('validate_sdoc');
	});

	it('answers an unknown (newer) protocol version with its own latest', async () => {
		const { result } = await rpc('initialize', { protocolVersion: '2099-01-01' });
		expect((result as Record<string, any>).protocolVersion).toBe('2025-06-18');
	});

	it('returns null for notifications', async () => {
		expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
	});

	it('rejects batches and non-objects', async () => {
		const batch = await handleMcpMessage([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
		expect(batch?.error?.code).toBe(-32600);
	});

	it('answers ping and rejects unknown methods', async () => {
		expect((await rpc('ping')).result).toEqual({});
		expect((await rpc('nope/nope')).error?.code).toBe(-32601);
	});

	it('lists the fourteen tools, reads before writes', async () => {
		const { result } = await rpc('tools/list');
		const names = (result as { tools: { name: string }[] }).tools.map((t) => t.name);
		expect(names).toEqual([
			'validate_sdoc',
			'scaffold_component_doc',
			'get_authoring_guide',
			'get_changelog',
			'list_docs',
			'search_docs',
			'check_docs',
			'check_coverage',
			'resolve_visual_target',
			'get_component_api',
			// The writes come last, so a tool list read top-to-bottom is
			// everything that only looks, then everything that changes a file.
			'set_notes',
			'set_status',
			'set_todos',
			'toggle_todo',
		]);
	});

	it('serves the visual testing guide as a resource', async () => {
		const list = (await rpc('resources/list')).result as { resources: { uri: string }[] };
		expect(list.resources.map((r) => r.uri)).toContain('sdocs://visual-testing-guide');
		const read = (await rpc('resources/read', { uri: 'sdocs://visual-testing-guide' }))
			.result as { contents: { text: string }[] };
		expect(read.contents[0].text).toContain('captureRect');
	});

	it('tells clients not to photograph the Explorer to inspect one component', async () => {
		const { result } = await rpc('initialize', {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'test', version: '0' },
		});
		const instructions = (result as Record<string, any>).instructions as string;
		expect(instructions).toContain('resolve_visual_target');
		expect(instructions).toContain('data-sdocs-stage-ready');
	});

	it('validates a correct .sdoc (null args included)', async () => {
		const result = await callTool('validate_sdoc', { source: VALID_SDOC });
		expect(result.structuredContent).toMatchObject({
			valid: true,
			diagnostics: [],
			entities: [{ kind: 'SHOWCASE', title: 'Forms / Button' }],
		});
	});

	it('reports diagnostics with 1-based positions', async () => {
		const bad = '[SHOWCASE title="X" nope="y"]\n[/SHOWCASE]\n';
		const structured = (await callTool('validate_sdoc', { source: bad }))
			.structuredContent as Record<string, any>;
		expect(structured.valid).toBe(false);
		const diag = structured.diagnostics[0];
		expect(diag.code).toBe('unknown-attr');
		expect(diag.line).toBe(1);
		expect(diag.column).toBeGreaterThan(1);
	});

	it('scaffolds a starter doc from extracted props', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-'));
		const component = join(dir, 'Chip.svelte');
		writeFileSync(
			component,
			`<script lang="ts">
	interface Props {
		/** The label */
		text?: string;
		variant?: 'solid' | 'outline';
		count?: number;
	}
	let { text = 'Chip', variant = 'solid', count }: Props = $props();
</script>

<span>{text}{count}</span>
`,
		);
		const structured = (await callTool('scaffold_component_doc', { componentPath: component }))
			.structuredContent as Record<string, any>;
		expect(structured.suggestedPath).toBe(join(dir, 'Chip.sdoc'));
		expect(structured.sdoc).toContain('[SHOWCASE title="Chip"');
		expect(structured.sdoc).toContain("text: 'Chip'");
		expect(structured.sdoc).toContain("variant: 'solid'");
		expect(structured.sdoc).toContain('<Chip {...args} />');
		// The scaffold must itself be valid.
		const check = (await callTool('validate_sdoc', { source: structured.sdoc }))
			.structuredContent as Record<string, any>;
		expect(check.valid).toBe(true);
	});

	it('reports an unreadable component as a tool error, not a crash', async () => {
		const result = await callTool('scaffold_component_doc', {
			componentPath: '/definitely/not/here/X.svelte',
		});
		expect(result.isError).toBe(true);
	});

	it('returns a component’s full extracted API', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-api-'));
		const component = join(dir, 'Field.svelte');
		writeFileSync(
			component,
			`<script lang="ts">
	import type { Snippet } from 'svelte';
	/**
	 * @cssvar {color} --bg - Field background (default: #fff)
	 */
	interface Props {
		/** The field label */
		label: string;
		onchange?: (value: string) => void;
		children?: Snippet;
	}
	let { label, onchange, children }: Props = $props();

	/** Clears the value */
	export function clear(): void {}
</script>

<label class="Field">{label}</label>

<style>
	.Field {
		background: var(--bg, #fff);
	}
</style>
`,
		);
		const api = (await callTool('get_component_api', { componentPath: component }))
			.structuredContent as Record<string, any>;
		expect(api.component).toBe('Field');
		expect(api.props).toMatchObject([{ name: 'label', description: 'The field label' }]);
		expect(api.events).toMatchObject([{ name: 'onchange' }]);
		expect(api.snippets).toMatchObject([{ name: 'children' }]);
		expect(api.methods).toMatchObject([{ name: 'clear', description: 'Clears the value' }]);
		expect(api.cssProps).toMatchObject([{ name: '--bg', type: 'color' }]);
	});

	it('maps the project docs with list_docs', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-docs-'));
		writeFileSync(join(dir, 'sdocs.config.js'), 'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n');
		writeFileSync(
			join(dir, 'Button.sdoc'),
			'<script>\n\timport Button from "./Button.svelte";\n</script>\n\n' + VALID_SDOC.split('\n').slice(4).join('\n'),
		);
		const prev = process.cwd();
		process.chdir(dir);
		try {
			const result = (await callTool('list_docs')).structuredContent as Record<string, any>;
			expect(result.count).toBe(1);
			expect(result.docs[0]).toMatchObject({
				valid: true,
				entities: [{ kind: 'SHOWCASE', title: 'Forms / Button', components: ['Button'] }],
			});
			expect(result.docs[0].file).toBe('Button.sdoc');
			// The route the site actually serves — folders and slug rules included.
			expect(result.docs[0].entities[0].route).toBe('/docs/forms/button');
		} finally {
			process.chdir(prev);
		}
	});

	describe('search_docs', () => {
		const PROJECT = [
			'<script>',
			'\timport Badge from "./Badge.svelte";',
			'</script>',
			'',
			'[SHOWCASE title="Display / Badge"]',
			'\t[NOTES]',
			'\t\t- warning: Being replaced by Chip in v4.',
			'\t[/NOTES]',
			'\t[COMPONENT component={Badge} synonyms="pill, chip, tag"]',
			'\t\t<Badge {...args} />',
			'\t[/COMPONENT]',
			'',
			'\t[EXAMPLE title="In a user menu" tags="user menu, avatar"]',
			'\t\t<Badge />',
			'\t[/EXAMPLE]',
			'',
			'\t[EXAMPLE title="Plain"]',
			'\t\t[NOTES]',
			'\t\t\t- bug: Contrast is unverified here.',
			'\t\t\t- A plain remark.',
			'\t\t[/NOTES]',
			'\t\t<Badge />',
			'\t[/EXAMPLE]',
			'[/SHOWCASE]',
			'',
		].join('\n');

		async function inProject<T>(run: () => Promise<T>): Promise<T> {
			const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-search-'));
			writeFileSync(join(dir, 'sdocs.config.js'), 'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n');
			writeFileSync(join(dir, 'Badge.sdoc'), PROJECT);
			const prev = process.cwd();
			process.chdir(dir);
			try {
				return await run();
			} finally {
				process.chdir(prev);
			}
		}

		const search = async (query: string) =>
			(await callTool('search_docs', { query })).structuredContent as Record<string, any>;

		it('finds a component by a fragment of its name', async () => {
			const found = await inProject(() => search('adg'));
			expect(found.results).toMatchObject([
				{ kind: 'SHOWCASE', title: 'Display / Badge', matched: ['title', 'component: Badge'] },
			]);
		});

		it('finds a component by a synonym', async () => {
			const found = await inProject(() => search('chip'));
			// "Chip" is both a synonym and a word in the entity's note, and the
			// hit says so — every name that matched, not just the first.
			expect(found.results).toMatchObject([
				{
					title: 'Display / Badge',
					matched: ['synonym: chip', 'note: Being replaced by Chip in v4.'],
				},
			]);
		});

		it('finds a synonym from a fragment, not just the whole word', async () => {
			const found = await inProject(() => search('PIL'));
			expect(found.results).toMatchObject([{ matched: ['synonym: pill'] }]);
		});

		it('finds an example by a tag, and reports its route', async () => {
			const found = await inProject(() => search('avatar'));
			expect(found.results).toHaveLength(1);
			expect(found.results[0]).toMatchObject({
				kind: 'example',
				title: 'Display / Badge / In a user menu',
				tags: ['user menu', 'avatar'],
				matched: ['tag: avatar'],
			});
			expect(found.results[0].route).toBe('/docs/display/badge/in-a-user-menu');
		});

		it('reports every name a single query matched', async () => {
			// "tag" is both a synonym of the component and part of a word in
			// nothing else — the entity hit says which name did it.
			const found = await inProject(() => search('tag'));
			expect(found.results[0].matched).toEqual(['synonym: tag']);
		});

		it('finds a page by the text of its note', async () => {
			const found = await inProject(() => search('replaced by chip'));
			expect(found.results).toMatchObject([
				{ title: 'Display / Badge', matched: ['note: Being replaced by Chip in v4.'] },
			]);
			// The notes come back with the hit — the point of finding it is to
			// read what it says.
			expect(found.results[0].notes).toEqual([
				{ note: 'Being replaced by Chip in v4.', type: 'warning' },
			]);
		});

		it('sweeps by type with no query at all', async () => {
			const found = await inProject(async () =>
				((await callTool('search_docs', { type: 'bug' })).structuredContent) as Record<string, any>,
			);
			expect(found.results).toHaveLength(1);
			expect(found.results[0]).toMatchObject({
				kind: 'example',
				title: 'Display / Badge / Plain',
				matched: ['note type: bug'],
			});
		});

		it("finds a note written without a type under 'none'", async () => {
			const found = await inProject(async () =>
				((await callTool('search_docs', { type: 'none' })).structuredContent) as Record<string, any>,
			);
			expect(found.results).toHaveLength(1);
			expect(found.results[0].title).toBe('Display / Badge / Plain');
		});

		it('requires both when both are given', async () => {
			const both = async (query: string, type: string) =>
				((await callTool('search_docs', { query, type })).structuredContent) as Record<string, any>;
			// "Plain" is the example's title and a word in its own remark, and
			// that example carries a danger note — so danger keeps it and
			// warning (which only the entity has) does not.
			const danger = await inProject(() => both('plain', 'bug'));
			expect(danger.results.map((r: { title: string }) => r.title)).toEqual([
				'Display / Badge / Plain',
			]);
			const warning = await inProject(() => both('plain', 'warning'));
			expect(warning.results.map((r: { title: string }) => r.title)).toEqual([]);
		});

		it('needs a query or a type', async () => {
			const { error } = await rpc('tools/call', { name: 'search_docs', arguments: {} });
			expect(error?.message).toContain('query, a type, or both');
		});

		it('comes back empty rather than guessing', async () => {
			const found = await inProject(() => search('nothing-here'));
			expect(found).toMatchObject({ total: 0, results: [] });
		});

		it('refuses a blank query with nothing else to go on', async () => {
			const { error } = await rpc('tools/call', { name: 'search_docs', arguments: { query: '  ' } });
			expect(error?.message).toContain('query, a type, or both');
		});

		it('refuses a type it does not know', async () => {
			const { error } = await rpc('tools/call', {
				name: 'search_docs',
				arguments: { type: 'critical' },
			});
			expect(error?.message).toContain('type must be one of');
		});
	});

	describe('resolve_visual_target', () => {
		/** A project with two stages, one of which is a real component preview. */
		const project = () => {
			const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-visual-'));
			writeFileSync(
				join(dir, 'sdocs.config.js'),
				'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n',
			);
			writeFileSync(
				join(dir, 'Button.svelte'),
				'<script lang="ts">\n\tlet { label = "hi" } = $props();\n</script>\n\n<button>{label}</button>\n',
			);
			writeFileSync(
				join(dir, 'Button.sdoc'),
				'<script lang="ts">\n\timport Button from "./Button.svelte";\n</script>\n\n' +
					'[SHOWCASE title="Forms / Button"]\n' +
					'\t[component component={Button} args={{ label: "Hi" }} padding="24px"]\n' +
					'\t\t<Button {...args} />\n' +
					'\t[/component]\n\n' +
					'\t[example title="Sizes"]\n' +
					'\t\t<Button label="Small" />\n' +
					'\t[/example]\n' +
					'[/SHOWCASE]\n',
			);
			return dir;
		};

		const inProject = async <T>(fn: () => Promise<T>): Promise<T> => {
			const dir = project();
			const prev = process.cwd();
			process.chdir(dir);
			try {
				return await fn();
			} finally {
				process.chdir(prev);
			}
		};

		it('resolves a qualified name to a preview route and the files behind it', async () => {
			await inProject(async () => {
				const r = (await callTool('resolve_visual_target', { target: 'Button / Sizes' }))
					.structuredContent as Record<string, any>;
				expect(r.resolved).toBeTruthy();
				expect(r.resolved.name).toBe('Sizes');
				expect(r.resolved.kind).toBe('example');
				// Relative on purpose: it has to work at any host, port, or base.
				expect(r.resolved.previewRoute).toMatch(/^\/@sdocs\/preview\/[^/]+\/x-sizes$/);
				expect(r.resolved.builtPreviewPath).toMatch(/^\/previews\/[^/]+\/x-sizes\.html$/);
				expect(r.resolved.source.doc).toBe('Button.sdoc');
				expect(r.resolved.source.line).toBeGreaterThan(0);
			});
		});

		it('reports the component file to edit, not just the route to look at', async () => {
			await inProject(async () => {
				const r = (await callTool('resolve_visual_target', { target: 'Button' }))
					.structuredContent as Record<string, any>;
				const hit = r.resolved ?? r.ambiguous?.[0];
				expect(hit.kind).toBe('component');
				expect(hit.source.component).toBe('Button.svelte');
				expect(hit.args).toEqual({ label: 'Hi' });
			});
		});

		it("reports the author's stage padding — the room a shadow gets to live in", async () => {
			await inProject(async () => {
				const r = (await callTool('resolve_visual_target', { target: 'Button' }))
					.structuredContent as Record<string, any>;
				const hit = r.resolved ?? r.ambiguous?.[0];
				expect(hit.stageLayout.padding).toBe('24px');
			});
		});

		it('accepts a stage id, with or without the sdocs: prefix', async () => {
			await inProject(async () => {
				const first = (await callTool('resolve_visual_target', { target: 'Button / Sizes' }))
					.structuredContent as Record<string, any>;
				const id = first.resolved.stageId;
				for (const target of [id, `sdocs:${id}`]) {
					const r = (await callTool('resolve_visual_target', { target }))
						.structuredContent as Record<string, any>;
					expect(r.resolved.stageId).toBe(id);
				}
			});
		});

		it('carries the selectors an automation client waits on', async () => {
			await inProject(async () => {
				const r = (await callTool('resolve_visual_target', { target: 'Button / Sizes' }))
					.structuredContent as Record<string, any>;
				expect(r.resolved.readySelector).toBe('[data-sdocs-stage-ready]');
				expect(r.resolved.stageSelector).toBe('#sdocs-preview');
			});
		});

		it('resolves an entity route to the entity\'s own stage', async () => {
			await inProject(async () => {
				const listed = (await callTool('list_docs')).structuredContent as Record<string, any>;
				const route = listed.docs[0].entities[0].route as string;
				const r = (await callTool('resolve_visual_target', { target: route }))
					.structuredContent as Record<string, any>;
				// The entity route means the entity — its [component] preview —
				// not one of its examples.
				expect(r.resolved?.kind).toBe('component');
				expect(r.resolved?.name).toBe('Button');
			});
		});

		it('resolves a stage route to that stage', async () => {
			await inProject(async () => {
				const listed = (await callTool('list_docs')).structuredContent as Record<string, any>;
				const exampleRoute = listed.docs[0].entities[0].examples[0].route as string;
				const r = (await callTool('resolve_visual_target', { target: exampleRoute }))
					.structuredContent as Record<string, any>;
				expect(r.resolved?.name).toBe('Sizes');
				expect(r.resolved?.kind).toBe('example');
			});
		});

		it('does not fuzzy-match a route that addresses nothing', async () => {
			// A route is an exact address. Flattening it into words made
			// unrelated paths appear to resolve.
			await inProject(async () => {
				const r = (await callTool('resolve_visual_target', { target: '/no/such/route' }))
					.structuredContent as Record<string, any>;
				expect(r.resolved).toBe(null);
			});
		});

		it('reports a LAYOUT\'s .sdoc line and its sole component root', async () => {
			const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-layout-'));
			writeFileSync(
				join(dir, 'sdocs.config.js'),
				'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n',
			);
			writeFileSync(join(dir, 'Inbox.svelte'), '<div>inbox</div>\n');
			writeFileSync(
				join(dir, 'Mail.sdoc'),
				'<script lang="ts">\n\timport Inbox from "./Inbox.svelte";\n</script>\n\n' +
					'[LAYOUT title="Mocks / Mail / Inbox"]\n\t<Inbox />\n[/LAYOUT]\n',
			);
			const prev = process.cwd();
			process.chdir(dir);
			try {
				const r = (await callTool('resolve_visual_target', { target: 'Inbox / Content' }))
					.structuredContent as Record<string, any>;
				expect(r.resolved?.kind).toBe('layout');
				expect(r.resolved?.source.line).toBe(5);
				expect(r.resolved?.source.component).toBe('Inbox.svelte');
			} finally {
				process.chdir(prev);
			}
		});

		it('explains that a DOC route has no stage instead of returning a bare null', async () => {
			const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-docroute-'));
			writeFileSync(
				join(dir, 'sdocs.config.js'),
				'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n',
			);
			writeFileSync(join(dir, 'Guide.sdoc'), '[DOC title="Guides / Intro"]\n\n\tProse.\n\n[/DOC]\n');
			const prev = process.cwd();
			process.chdir(dir);
			try {
				const r = (await callTool('resolve_visual_target', { target: '/docs/guides/intro' }))
					.structuredContent as Record<string, any>;
				expect(r.resolved).toBe(null);
				expect(r.reason).toContain('no preview page');
				expect(r.kind).toBe('DOC');
			} finally {
				process.chdir(prev);
			}
		});

		it('returns nothing rather than a wrong guess', async () => {
			await inProject(async () => {
				const r = (await callTool('resolve_visual_target', { target: 'Nothing Like This' }))
					.structuredContent as Record<string, any>;
				expect(r.resolved).toBe(null);
				expect(r.hint).toBeTruthy();
			});
		});
	});

	it('compiles every stage with check_docs and reports what breaks', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-check-'));
		writeFileSync(join(dir, 'sdocs.config.js'), 'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n');
		writeFileSync(
			join(dir, 'Thing.svelte'),
			'<script lang="ts">\n\tlet { label = "hi" } = $props();\n</script>\n\n<span>{label}</span>\n',
		);
		writeFileSync(
			join(dir, 'Broken.sdoc'),
			'<script lang="ts">\n\timport Thing from "./Thing.svelte";\n</script>\n\n' +
				'[SHOWCASE title="Broken"]\n\t[component component={Thing}]\n\t\t<Thing />\n\t[/component]\n\n' +
				'\t[example title="Unclosed"]\n\t\t<div>\n\t\t\t<Thing />\n\t[/example]\n[/SHOWCASE]\n',
		);
		const prev = process.cwd();
		process.chdir(dir);
		try {
			const result = (await callTool('check_docs')).structuredContent as Record<string, any>;
			expect(result.ok).toBe(false);
			expect(result.errorCount).toBeGreaterThan(0);
			expect(result.checked.stages).toBe(2);
			expect(result.problems.some((p: any) => p.stage === 'Unclosed')).toBe(true);
		} finally {
			process.chdir(prev);
		}
	});

	it('reports documentation coverage with check_coverage', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-cov-'));
		writeFileSync(join(dir, 'sdocs.config.js'), 'export default {\n\tinclude: ["./**/*.sdoc"],\n};\n');
		const component = '<script lang="ts">\n\tlet { label = "hi" } = $props();\n</script>\n\n<span>{label}</span>\n';
		writeFileSync(join(dir, 'Shown.svelte'), component);
		writeFileSync(join(dir, 'Hidden.svelte'), component);
		writeFileSync(
			join(dir, 'Shown.sdoc'),
			'<script lang="ts">\n\timport Shown from "./Shown.svelte";\n</script>\n\n' +
				'[SHOWCASE title="Shown"]\n\t[component component={Shown}]\n\t\t<Shown />\n\t[/component]\n[/SHOWCASE]\n',
		);
		const prev = process.cwd();
		process.chdir(dir);
		try {
			const result = (await callTool('check_coverage')).structuredContent as Record<string, any>;
			expect(result.counts).toMatchObject({ components: 2, documented: 1, undocumented: 1 });
			expect(result.undocumented).toEqual(['Hidden.svelte']);
		} finally {
			process.chdir(prev);
		}
	});

	it('serves the authoring guide as a tool and as a resource', async () => {
		const viaTool = await callTool('get_authoring_guide');
		expect(viaTool.content[0].text).toContain('# sdocs');

		const { result } = await rpc('resources/read', { uri: 'sdocs://authoring-guide' });
		const contents = (result as Record<string, any>).contents;
		expect(contents[0].mimeType).toBe('text/markdown');
		expect(contents[0].text).toContain('.sdoc');

		const bad = await rpc('resources/read', { uri: 'sdocs://nope' });
		expect(bad.error?.code).toBe(-32002);
	});
});

describe('validate_sdoc reports where a title will be served', () => {
	// Slug rules have a trap an author can only discover after publishing:
	// segments are lowercased whole, so CamelCase does not split. Reporting the
	// route at validate time is where the author is already looking.
	const routesOf = async (source: string) =>
		((await callTool('validate_sdoc', { source })).structuredContent as {
			entities: { title: string; route: string }[];
		}).entities;

	it('does not split CamelCase — the trap, made visible', async () => {
		const [entity] = await routesOf('[SHOWCASE title="IconButton"]\n[/SHOWCASE]');
		expect(entity.route).toBe('/iconbutton');
	});

	it('slugifies each segment of a nested title', async () => {
		const [entity] = await routesOf('[SHOWCASE title="Form Controls / Icon Button"]\n[/SHOWCASE]');
		expect(entity.route).toBe('/form-controls/icon-button');
	});

	it('carries the section prefix', async () => {
		const [entity] = await routesOf('[DOC title="@guides/Getting Started"]\n[/DOC]');
		expect(entity.route).toBe('/guides/getting-started');
	});

	it('honours an explicit slug override on the leaf', async () => {
		const [entity] = await routesOf('[SHOWCASE title="IconButton" slug="icon-button"]\n[/SHOWCASE]');
		expect(entity.route).toBe('/icon-button');
	});
});

/**
 * The guide is ~40k characters. An agent that needs to know how one block is
 * written should not have to read all of it — and one that arrives at a
 * project on a newer sdocs needs the breaking changes before it writes
 * anything.
 */
describe('get_authoring_guide({ section }) and get_changelog({ since })', () => {
	const textOf = async (name: string, args: Record<string, unknown> = {}) =>
		(await callTool(name, args)).content[0].text;

	it('returns one section, far smaller than the whole guide', async () => {
		const whole = await textOf('get_authoring_guide');
		const section = await textOf('get_authoring_guide', { section: 'PROSE' });
		expect(section).toContain('[PROSE]');
		expect(section.length).toBeLessThan(whole.length / 5);
		// It is a section, not a slice: it starts at a heading and stops at one.
		expect(section.startsWith('## ')).toBe(true);
		expect(section.split('\n## ').length).toBe(1);
	});

	it('matches a heading loosely, so the caller need not know its punctuation', async () => {
		expect(await textOf('get_authoring_guide', { section: 'notes' })).toContain('[NOTES]');
	});

	// The reply to a miss is the answer to "what sections are there?", which is
	// the question behind the miss.
	it('answers an unknown section with the list of headings', async () => {
		const reply = await textOf('get_authoring_guide', { section: 'nothing-like-this' });
		expect(reply).toContain('No section matches');
		expect(reply).toContain('- Configuration');
	});

	it('leads with breaking changes when asked what changed since a version', async () => {
		const reply = await textOf('get_changelog', { since: '0.0.137' });
		expect(reply.startsWith('# Breaking changes since 0.0.137')).toBe(true);
		expect(reply).toContain('[NOTES]');
		// The full entries follow the summary.
		expect(reply).toContain('### Added');
	});

	it('returns the whole changelog with no version, and says so for an unknown one', async () => {
		expect(await textOf('get_changelog')).toContain('# Changelog');
		expect(await textOf('get_changelog', { since: '9.9.9' })).toContain('No release "9.9.9"');
	});
});

/**
 * Reading and writing the blocks.
 *
 * The writes exist because an agent asked to "mark Button deprecated" will
 * edit that `.sdoc` one way or another — through a tool that splices the one
 * attribute, or by pattern-matching the source. The first cannot produce a
 * file that does not parse.
 */
describe('the blocks over MCP', () => {
	const SOURCE = [
		'[SHOWCASE title="Display / Badge"]',
		'',
		'\t[NOTES]',
		'\t\t- bug: Overflows past 99.',
		'\t[/NOTES]',
		'',
		'\t[TODO]',
		'\t\t- [ ] Cap the count',
		'\t\t\t- [ ] Decide the ceiling',
		'\t[/TODO]',
		'',
		'\t[GLOSSARY title="Terms"]',
		'\t\t- Badge: a small count or label attached to something.',
		'\t[/GLOSSARY]',
		'',
		'\t[COMPONENT component={Badge}]',
		'\t\t<Badge />',
		'\t[/COMPONENT]',
		'',
		'[/SHOWCASE]',
		'',
	].join('\n');

	function project() {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-mcp-blocks-'));
		writeFileSync(join(dir, 'sdocs.config.js'), 'export default { include: ["./*.sdoc"] };');
		writeFileSync(join(dir, 'Badge.sdoc'), SOURCE);
		return dir;
	}

	async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
		const prev = process.cwd();
		process.chdir(dir);
		try {
			return await fn();
		} finally {
			process.chdir(prev);
		}
	}

	it('reports todos and glossary terms, not just notes', async () => {
		const dir = project();
		const entity = await inDir(
			dir,
			async () => ((await callTool('list_docs')).structuredContent as any).docs[0].entities[0],
		);
		expect(entity.notes).toEqual([{ note: 'Overflows past 99.', type: 'bug' }]);
		expect(entity.todos[0].children[0].text).toBe('Decide the ceiling');
		expect(entity.glossary).toEqual([
			{ term: 'Badge', definition: 'a small count or label attached to something.' },
		]);
	});

	it('searches todo text and glossary definitions', async () => {
		const dir = project();
		const search = async (query: string) =>
			((await callTool('search_docs', { query })).structuredContent as any).results.flatMap(
				(r: { matched: string[] }) => r.matched,
			);
		expect(await inDir(dir, () => search('ceiling'))).toContain('todo: Decide the ceiling');
		expect(await inDir(dir, () => search('count or label'))).toContain('definition of Badge');
	});

	it('sets a status, and removes it again byte-for-byte', async () => {
		const dir = project();
		const file = join(dir, 'Badge.sdoc');
		const set = (status: string | null) =>
			inDir(dir, () =>
				callTool('set_status', {
					file: 'Badge.sdoc',
					entity: 'Display / Badge',
					component: 'Badge',
					status,
				}),
			);
		await set('review');
		expect(readFileSync(file, 'utf-8')).toContain('[COMPONENT component={Badge} status="review"]');
		await set(null);
		// The attribute and the space before it, and nothing else.
		expect(readFileSync(file, 'utf-8')).toBe(SOURCE);
	});

	it('ticks one todo without touching the author’s text', async () => {
		const dir = project();
		await inDir(dir, () =>
			callTool('toggle_todo', {
				file: 'Badge.sdoc',
				entity: 'Display / Badge',
				path: [0, 0],
				done: true,
			}),
		);
		expect(readFileSync(join(dir, 'Badge.sdoc'), 'utf-8')).toBe(
			SOURCE.replace('- [ ] Decide the ceiling', '- [x] Decide the ceiling'),
		);
	});

	it('replaces the notes block wholesale', async () => {
		const dir = project();
		await inDir(dir, () =>
			callTool('set_notes', {
				file: 'Badge.sdoc',
				entity: 'Display / Badge',
				notes: [{ note: 'Pair it with Avatar.', type: 'tip' }],
			}),
		);
		const out = readFileSync(join(dir, 'Badge.sdoc'), 'utf-8');
		expect(out).toContain('- tip: Pair it with Avatar.');
		expect(out).not.toContain('Overflows past 99');
	});

	// The same guard the dev server's endpoints use: a write tool that touches
	// any path it is handed can be pointed anywhere.
	it('refuses a file the project does not document', async () => {
		const dir = project();
		const { error } = await inDir(dir, () =>
			rpc('tools/call', {
				name: 'set_status',
				arguments: {
					file: '../../etc/passwd',
					entity: 'Display / Badge',
					component: 'Badge',
					status: 'ready',
				},
			}),
		);
		expect(error?.message).toContain('not a .sdoc this project documents');
	});

	it('refuses a status outside the vocabulary, and an entity that is not there', async () => {
		const dir = project();
		const bad = await inDir(dir, () =>
			rpc('tools/call', {
				name: 'set_status',
				arguments: {
					file: 'Badge.sdoc',
					entity: 'Display / Badge',
					component: 'Badge',
					status: 'stable',
				},
			}),
		);
		expect(bad.error?.message).toContain('status must be one of');
		const missing = await inDir(dir, () =>
			rpc('tools/call', {
				name: 'set_notes',
				arguments: { file: 'Badge.sdoc', entity: 'Nope', notes: [] },
			}),
		);
		expect(missing.error?.message).toContain('No entity called "Nope"');
	});
});

/**
 * Every write tool is read-modify-write. Two landing on one file concurrently
 * both read the original, and the second overwrites the first — while both
 * report `changed: true` for edits only one of which survived.
 */
describe('concurrent writes to one file', () => {
	it('keeps both edits', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sdocs-race-'));
		writeFileSync(join(dir, 'sdocs.config.js'), 'export default { include: ["./*.sdoc"] };');
		const file = join(dir, 'Badge.sdoc');
		writeFileSync(
			file,
			[
				'[SHOWCASE title="Display / Badge"]',
				'',
				'\t[COMPONENT component={Badge}]',
				'\t\t<Badge />',
				'\t[/COMPONENT]',
				'',
				'[/SHOWCASE]',
				'',
			].join('\n'),
		);
		const prev = process.cwd();
		process.chdir(dir);
		try {
			await Promise.all([
				callTool('set_status', {
					file: 'Badge.sdoc',
					entity: 'Display / Badge',
					component: 'Badge',
					status: 'ready',
				}),
				callTool('set_notes', {
					file: 'Badge.sdoc',
					entity: 'Display / Badge',
					notes: [{ note: 'Both edits must survive.', type: 'tip' }],
				}),
			]);
		} finally {
			process.chdir(prev);
		}
		const out = readFileSync(file, 'utf-8');
		expect(out).toContain('status="ready"');
		expect(out).toContain('- tip: Both edits must survive.');
	});
});
