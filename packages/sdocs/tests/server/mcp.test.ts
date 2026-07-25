import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
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

	it('lists the eight tools', async () => {
		const { result } = await rpc('tools/list');
		const names = (result as { tools: { name: string }[] }).tools.map((t) => t.name);
		expect(names).toEqual([
			'validate_sdoc',
			'scaffold_component_doc',
			'get_authoring_guide',
			'list_docs',
			'check_docs',
			'check_coverage',
			'resolve_visual_target',
			'get_component_api',
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
