import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSdoc } from '../language/parser.js';
import { offsetToPosition } from '../language/scanner.js';
import { parseComponentSource } from '../server/prop-parser.js';
import { loadConfig } from '../server/config.js';
import { discoverDocFiles } from '../server/discovery.js';
import { buildSections } from '../explorer/tree-builder.js';
import type { DocEntry, ParsedProp } from '../types.js';

/**
 * The sdocs MCP server: authoring tools for agent clients, built directly on
 * the language module so they can't drift from the shipped parser. This file
 * is transport-agnostic — `handleMcpMessage` maps one JSON-RPC message to its
 * response (or null for notifications); stdio.ts and http.ts carry the wire.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package root: dist/mcp → two up; when running from source, three up. */
function packageRoot(): string {
	const two = resolve(__dirname, '..', '..');
	if (existsSync(resolve(two, 'llms.txt'))) return two;
	return resolve(__dirname, '..', '..', '..');
}

function packageVersion(): string {
	try {
		const pkg = JSON.parse(readFileSync(resolve(packageRoot(), 'package.json'), 'utf-8'));
		return pkg.version;
	} catch {
		return 'unknown';
	}
}

function authoringGuide(): string {
	return readFileSync(resolve(packageRoot(), 'llms.txt'), 'utf-8');
}

// --- JSON-RPC / MCP plumbing ------------------------------------------------

export interface JsonRpcMessage {
	jsonrpc?: string;
	id?: number | string | null;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string };
}

/** Spec revisions this server implements. An unknown (newer) client version
 * gets our latest back; per spec the client then decides. */
const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
const LATEST_PROTOCOL = PROTOCOL_VERSIONS[PROTOCOL_VERSIONS.length - 1];

const GUIDE_URI = 'sdocs://authoring-guide';

const INSTRUCTIONS =
	'sdocs authoring tools. Before writing .sdoc documentation, read the ' +
	'authoring guide (the get_authoring_guide tool, or the sdocs://authoring-guide ' +
	'resource). Validate every .sdoc you produce with validate_sdoc and fix its ' +
	'diagnostics. scaffold_component_doc generates a starter doc from a .svelte ' +
	"component's extracted props. To learn the current project, list_docs maps " +
	'its .sdoc files and the components they document, and get_component_api ' +
	"returns a component's full extracted API (props, events, snippets, methods, " +
	'states, CSS custom properties).';

const TOOLS = [
	{
		name: 'validate_sdoc',
		description:
			'Validate .sdoc source text with the real sdocs parser. Returns the ' +
			'diagnostics (message, code, 1-based line/column) and the entities found. ' +
			'Run this on every .sdoc file you write or edit, and fix what it reports.',
		inputSchema: {
			type: 'object',
			properties: {
				source: { type: 'string', description: 'The full text of the .sdoc file' },
			},
			required: ['source'],
		},
	},
	{
		name: 'scaffold_component_doc',
		description:
			'Generate a starter .sdoc for a Svelte component. Extracts the ' +
			"component's props and returns the .sdoc text (with control defaults " +
			'derived from the props) plus the suggested file path — it does not ' +
			'write any file.',
		inputSchema: {
			type: 'object',
			properties: {
				componentPath: {
					type: 'string',
					description: 'Path to the .svelte component (absolute, or relative to the project root)',
				},
				title: {
					type: 'string',
					description:
						'Optional sidebar path for the SHOWCASE title, e.g. "Forms / Button" (defaults to the component name)',
				},
			},
			required: ['componentPath'],
		},
	},
	{
		name: 'get_authoring_guide',
		description:
			'The complete sdocs authoring guide: setup, configuration, the CLI, and ' +
			'the full .sdoc format reference. Read it before writing .sdoc files.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'list_docs',
		description:
			"Map the current project's documentation: every .sdoc file the config's " +
			'include globs match, each with its entities (kind, title) and the ' +
			'components its previews document, plus the site route each entity ' +
			'serves at (and one per example) — open those with a browser to smoke ' +
			'test. Use it to see what exists before writing docs.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'get_component_api',
		description:
			"A Svelte component's full extracted API, exactly as sdocs documents it: " +
			'props (with types, defaults, descriptions), events, snippets, methods, ' +
			'states, CSS custom properties, and class/rest forwarding. Use it to ' +
			'read a component in this project without parsing the source yourself.',
		inputSchema: {
			type: 'object',
			properties: {
				componentPath: {
					type: 'string',
					description: 'Path to the .svelte component (absolute, or relative to the project root)',
				},
			},
			required: ['componentPath'],
		},
	},
];

// --- Tools -------------------------------------------------------------------

function validateSdoc(params: Record<string, unknown>) {
	const source = params.source;
	if (typeof source !== 'string') return invalidParams('source must be a string');
	const doc = parseSdoc(source);
	const result = {
		valid: doc.diagnostics.length === 0,
		diagnostics: doc.diagnostics.map((d) => {
			const pos = offsetToPosition(source, d.span.start);
			return { code: d.code, message: d.message, line: pos.line + 1, column: pos.column + 1 };
		}),
		entities: doc.entities.map((e) => ({ kind: e.kind, title: e.title })),
	};
	return toolResult(result);
}

/** Derive an args control default for a prop, or null to leave it out. */
function argLiteral(prop: ParsedProp): string | null {
	const t = prop.type?.trim() ?? '';
	const stringy = t === 'string' || /^'[^'\n]*'(?:\s*\|\s*'[^'\n]*')*$/.test(t);
	const d = prop.default?.trim();
	if (d) {
		// The prop parser hands string defaults back unquoted ("Chip", "solid").
		if (/^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(d)) return d;
		if (/^'[^'\n]*'$/.test(d)) return d;
		if (/^"[^"\n]*"$/.test(d)) return `'${d.slice(1, -1)}'`;
		// A bare word is a stripped string literal; expressions ($bindable(…),
		// arrays, objects) are not representable as an args literal.
		if (stringy && !/[(){}[\]`$'"]/.test(d)) return `'${d}'`;
		return null;
	}
	// No default — a string-literal union still makes a good select control.
	const union = t.match(/^'([^'\n]*)'(?:\s*\|\s*'[^'\n]*')+$/);
	if (union) return `'${union[1]}'`;
	if (!prop.required) return null;
	if (t === 'string') return "'Text'";
	if (t === 'number') return '0';
	if (t === 'boolean') return 'false';
	return null;
}

async function scaffoldComponentDoc(params: Record<string, unknown>) {
	const read = await readComponent(params);
	if (!('abs' in read)) return read;
	const { abs, source } = read;
	const data = parseComponentSource(source);
	const fileName = basename(abs);
	const name = fileName.replace(/\.svelte$/, '').replace(/[^\w$]/g, '');
	const lang = /<script[^>]*\slang=["']ts["']/.test(source) ? ' lang="ts"' : '';
	const title = typeof params.title === 'string' && params.title ? params.title : name;

	const args = data.props
		.filter((p) => p.category === 'prop')
		.map((p) => [p.name, argLiteral(p)] as const)
		.filter((pair): pair is readonly [string, string] => pair[1] !== null)
		.slice(0, 8);
	const argsAttr = args.length
		? ` args={{ ${args.map(([k, v]) => `${k}: ${v}`).join(', ')} }}`
		: '';

	const sdoc = `<script${lang}>
	import ${name} from './${fileName}';
</script>

[SHOWCASE title="${title}" description=""]

	[component component={${name}}${argsAttr}]
		<${name} {...args} />
	[/component]

[/SHOWCASE]
`;

	return toolResult({
		suggestedPath: abs.replace(/\.svelte$/, '.sdoc'),
		sdoc,
		extracted: {
			props: data.props.filter((p) => p.category === 'prop').length,
			snippets: data.props.filter((p) => p.category === 'snippet').length,
			cssProps: data.cssProps.length,
		},
		note:
			'Write the sdoc text to the suggested path (next to the component), fill in ' +
			'the description, then validate with validate_sdoc.',
	});
}

const ENTITY_KIND_TO_DOC_KIND = {
	SHOWCASE: 'component',
	DOC: 'doc',
	PAGE: 'page',
	LAYOUT: 'layout',
} as const;

async function listDocs() {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);

	// Parse every file, then hand the entities to the Explorer's own section
	// builder so the reported routes are the routes the site serves — slug
	// rules, folders, sections, and `slug=` overrides included.
	const parsed: { file: string; doc: ReturnType<typeof parseSdoc> }[] = [];
	const entries: DocEntry[] = [];
	const entryOf = new Map<DocEntry, { file: string; title: string }>();

	for (const file of files) {
		const doc = parseSdoc(await readFile(file, 'utf-8'));
		parsed.push({ file, doc });
		for (const e of doc.entities) {
			const entry = {
				kind: ENTITY_KIND_TO_DOC_KIND[e.kind],
				filePath: file,
				routeSlug: e.routeSlug,
				hide: e.hide,
				meta: { title: e.title },
				examples: e.kind === 'SHOWCASE' ? e.examples.map((x) => ({ name: x.title })) : [],
			} as unknown as DocEntry;
			entries.push(entry);
			entryOf.set(entry, { file, title: e.title });
		}
	}

	const map = buildSections(entries, { sections: config.sections, home: config.home });

	// Invert the route table: entity route (no snippet) and one per example.
	const routeOf = new Map<DocEntry, string>();
	const exampleRoutes = new Map<DocEntry, { name: string; route: string }[]>();
	for (const [route, target] of map.routes) {
		if (target.snippetName) {
			const list = exampleRoutes.get(target.doc) ?? [];
			list.push({ name: target.snippetName, route: `/${route}` });
			exampleRoutes.set(target.doc, list);
		} else if (!routeOf.has(target.doc)) {
			routeOf.set(target.doc, `/${route}`);
		}
	}

	let cursor = 0;
	const docs = parsed.map(({ file, doc }) => ({
		file: relative(cwd, file),
		valid: doc.diagnostics.length === 0,
		entities: doc.entities.map((e) => {
			const entry = entries[cursor++];
			const examples = exampleRoutes.get(entry) ?? [];
			return {
				kind: e.kind,
				title: e.title,
				route: routeOf.get(entry) ?? null,
				...(e.kind === 'SHOWCASE'
					? {
							components: e.previews
								.map((p) => p.componentName)
								.filter((n): n is string => n !== null),
						}
					: {}),
				...(examples.length ? { examples } : {}),
			};
		}),
	}));

	return toolResult({
		project: cwd,
		include: config.include,
		count: files.length,
		docs,
		...(map.errors.length ? { structureErrors: map.errors.map((e) => e.message) } : {}),
	});
}

/** Resolve and read a .svelte component param, or answer with a tool error. */
async function readComponent(
	params: Record<string, unknown>,
): Promise<{ abs: string; source: string } | ReturnType<typeof toolError>> {
	const componentPath = params.componentPath;
	if (typeof componentPath !== 'string' || !componentPath.endsWith('.svelte')) {
		return invalidParams('componentPath must be a path to a .svelte file');
	}
	const abs = isAbsolute(componentPath) ? componentPath : resolve(process.cwd(), componentPath);
	try {
		return { abs, source: await readFile(abs, 'utf-8') };
	} catch {
		return toolError(`Cannot read ${abs} — check the path (cwd: ${process.cwd()}).`);
	}
}

async function getComponentApi(params: Record<string, unknown>) {
	const read = await readComponent(params);
	if (!('abs' in read)) return read;
	const data = parseComponentSource(read.source);
	return toolResult({
		component: basename(read.abs).replace(/\.svelte$/, ''),
		path: relative(process.cwd(), read.abs),
		props: data.props.filter((p) => p.category === 'prop'),
		events: data.props.filter((p) => p.category === 'event'),
		snippets: data.props.filter((p) => p.category === 'snippet'),
		methods: data.methods,
		states: data.state,
		cssProps: data.cssProps,
		acceptsClass: data.acceptsClass ?? false,
		forwardsRest: data.forwardsRest ?? false,
		restType: data.restType ?? null,
	});
}

// --- Result helpers ----------------------------------------------------------

function toolResult(structured: Record<string, unknown>) {
	return {
		content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
		structuredContent: structured,
	};
}

function toolError(message: string) {
	return { content: [{ type: 'text', text: message }], isError: true };
}

class RpcError extends Error {
	constructor(
		public code: number,
		message: string,
	) {
		super(message);
	}
}

function invalidParams(message: string): never {
	throw new RpcError(-32602, message);
}

// --- The handler ---------------------------------------------------------------

/**
 * Handle one JSON-RPC message. Returns the response, or null when the message
 * needs none (notifications, client responses).
 */
export async function handleMcpMessage(msg: unknown): Promise<JsonRpcResponse | null> {
	if (Array.isArray(msg) || typeof msg !== 'object' || msg === null) {
		return errorResponse(null, -32600, 'Expected a single JSON-RPC message object');
	}
	const { id, method, params = {} } = msg as JsonRpcMessage;

	// Notifications and client responses need no reply.
	if (id === undefined || id === null) return null;
	if (method === undefined) return null;

	try {
		const result = await dispatch(method, params);
		return { jsonrpc: '2.0', id, result };
	} catch (e) {
		if (e instanceof RpcError) return errorResponse(id, e.code, e.message);
		return errorResponse(id, -32603, e instanceof Error ? e.message : String(e));
	}
}

function errorResponse(id: number | string | null, code: number, message: string): JsonRpcResponse {
	return { jsonrpc: '2.0', id, error: { code, message } };
}

async function dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
	switch (method) {
		case 'initialize': {
			const requested = params.protocolVersion;
			const protocolVersion =
				typeof requested === 'string' && PROTOCOL_VERSIONS.includes(requested)
					? requested
					: LATEST_PROTOCOL;
			return {
				protocolVersion,
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: 'sdocs', title: 'sdocs', version: packageVersion() },
				instructions: INSTRUCTIONS,
			};
		}
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: TOOLS };
		case 'tools/call': {
			const args = (params.arguments ?? {}) as Record<string, unknown>;
			switch (params.name) {
				case 'validate_sdoc':
					return validateSdoc(args);
				case 'scaffold_component_doc':
					return scaffoldComponentDoc(args);
				case 'get_authoring_guide':
					return { content: [{ type: 'text', text: authoringGuide() }] };
				case 'list_docs':
					return listDocs();
				case 'get_component_api':
					return getComponentApi(args);
				default:
					throw new RpcError(-32602, `Unknown tool "${String(params.name)}"`);
			}
		}
		case 'resources/list':
			return {
				resources: [
					{
						uri: GUIDE_URI,
						name: 'authoring-guide',
						title: 'sdocs authoring guide',
						description:
							'Setup, configuration, the CLI, and the full .sdoc format reference.',
						mimeType: 'text/markdown',
					},
				],
			};
		case 'resources/read': {
			if (params.uri !== GUIDE_URI) {
				throw new RpcError(-32002, `Unknown resource "${String(params.uri)}"`);
			}
			return { contents: [{ uri: GUIDE_URI, mimeType: 'text/markdown', text: authoringGuide() }] };
		}
		default:
			throw new RpcError(-32601, `Method not found: ${method}`);
	}
}
