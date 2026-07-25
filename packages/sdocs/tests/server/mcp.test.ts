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

	it('lists the five tools', async () => {
		const { result } = await rpc('tools/list');
		const names = (result as { tools: { name: string }[] }).tools.map((t) => t.name);
		expect(names).toEqual([
			'validate_sdoc',
			'scaffold_component_doc',
			'get_authoring_guide',
			'list_docs',
			'get_component_api',
		]);
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
