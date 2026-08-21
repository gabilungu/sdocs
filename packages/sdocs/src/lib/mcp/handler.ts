import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSdoc } from '../language/parser.js';
import type { DocNote } from '../types.js';
import { offsetToPosition } from '../language/scanner.js';
import { parseComponentSource } from '../server/prop-parser.js';
import { loadConfig } from '../server/config.js';
import { discoverDocFiles } from '../server/discovery.js';
import { buildSections, slugifySegment, splitSection } from '../explorer/tree-builder.js';
import {
	extractImports,
	exampleSlug,
	planIframeSnippets,
	previewSlug,
	resolveComponentImport,
} from '../server/doc-model.js';
import { buildPreviewUrl, previewUrl } from '../server/snippet-compiler.js';
import { describeStages } from '../server/preview-runtime.js';
import { resolveStageLayout } from '../server/stage-layout.js';
import { VISUAL_TESTING_GUIDE } from './visual-guide.js';
import { checkDocFiles } from '../server/check.js';
import { measureCoverage } from '../server/coverage.js';
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
const VISUAL_URI = 'sdocs://visual-testing-guide';

const INSTRUCTIONS =
	'sdocs authoring tools. Before writing .sdoc documentation, read the ' +
	'authoring guide (the get_authoring_guide tool, or the sdocs://authoring-guide ' +
	'resource). Validate every .sdoc you produce with validate_sdoc and fix its ' +
	'diagnostics. scaffold_component_doc generates a starter doc from a .svelte ' +
	"component's extracted props. To learn the current project, list_docs maps " +
	'its .sdoc files and the components they document, and get_component_api ' +
	"returns a component's full extracted API (props, events, snippets, methods, " +
	'states, CSS custom properties). validate_sdoc checks the grammar only — ' +
	'run check_docs to compile every stage and catch what the grammar cannot ' +
	'see: Svelte errors inside examples, imports that resolve nowhere, and ' +
	'broken page or layout bodies.\n\n' +
	'For visual inspection, do not screenshot the Explorer by default. Call ' +
	'resolve_visual_target to get a preview-only route for the stage, open that ' +
	'route directly in the browser, wait for the [data-sdocs-stage-ready] ' +
	'marker, then locate the smallest relevant element and take an element ' +
	'screenshot at CSS-pixel scale. Photographing the whole Explorer to look at ' +
	'one component costs hundreds of times more image tokens than photographing ' +
	'the component. Prefer reading the DOM over taking any picture at all: ' +
	'getComputedStyle answers questions about spacing, color, and size exactly, ' +
	'where an image can only be estimated from. Capture the whole stage when ' +
	'the relationship between several elements matters, or when the component ' +
	'casts a shadow or glow past its own box; capture the Explorer only when ' +
	'diagnosing the documentation UI itself. sdocs://visual-testing-guide has ' +
	'the full procedure and worked examples.';

/** Results one search_docs call returns before it starts reporting a cut. */
const SEARCH_LIMIT = 50;

/** Note severities search_docs will filter on; 'none' is a note written
 * without an intent. */
const SEARCH_INTENTS = ['danger', 'warning', 'success', 'info', 'none'];

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
			'test. Entries also carry what the author wrote about them: a ' +
			"component's `synonyms`, an example's `tags`, and the `notes` on " +
			'either, so the map says which pages are marked deprecated or broken ' +
			'without opening them. Use it to see what exists before writing docs.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'search_docs',
		description:
			'Find documentation by any name it goes under — the entity title, a ' +
			'component it previews, that component\'s `synonyms`, an example ' +
			'title, an example\'s `tags`, or the text of any `notes` on either. ' +
			'Matching is a case-insensitive substring, so "butt" finds Button and ' +
			'"menu" finds every example tagged "user menu". `intent` sweeps by ' +
			'note severity instead — intent:"danger" lists everything marked ' +
			'danger, with no query at all; give both and a result has to satisfy ' +
			'both. Each hit reports which name matched, the notes it carries, and ' +
			'the route it serves at; pass that route to resolve_visual_target to ' +
			'screenshot it. Use it to find the right page before reading files.',
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'Text to look for in titles, component names, synonyms, tags and note text',
				},
				intent: {
					type: 'string',
					enum: SEARCH_INTENTS,
					description:
						"Only pages carrying a note of this severity; 'none' is a note written without an intent",
				},
				limit: {
					type: 'number',
					description: `Maximum results to return (default ${SEARCH_LIMIT}); the reply says how many were cut`,
				},
			},
		},
	},
	{
		name: 'check_docs',
		description:
			'Compile every documentation stage the way the dev server does — every ' +
			'preview, example, page, and layout body — and report what breaks: ' +
			'Svelte compile errors, relative imports that resolve to no file, and ' +
			'grammar diagnostics. This is the check `validate_sdoc` cannot do: it ' +
			'catches problems that otherwise appear only when the route is opened. ' +
			'Run it over the whole project (no arguments) or one file. It does not ' +
			'type-check, and cannot see runtime-only failures.',
		inputSchema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					description:
						'Optional single .sdoc file to check (absolute, or relative to the project root). Omit to check every file the config matches.',
				},
			},
		},
	},
	{
		name: 'check_coverage',
		description:
			'Documentation coverage: which components have a [component] preview ' +
			'and which do not. Compares the component source globs (config ' +
			'`components`, defaulting to the include globs with .sdoc swapped for ' +
			'.svelte) against every [component] in the project, resolved with the ' +
			"Explorer's own resolver — so a compound family counts per " +
			'sub-component. Reports undocumented files, components documented from ' +
			'more than one .sdoc file, references that resolve to no file, and ' +
			'documented components outside the globs.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'resolve_visual_target',
		description:
			'Resolve a stage — a [component] preview, an [example], or a [LAYOUT] — ' +
			'to a preview-only route and stable selectors intended for browser ' +
			'automation, plus the source files behind it. Accepts a name ' +
			'("Button / Sizes"), a site route from list_docs — an entity route ' +
			"resolves to that entity's own stage, a stage route to that stage — or " +
			'the id shown under a stage in the dev Explorer ("sdocs:k3f9a"). ' +
			'Navigate directly to previewRoute: it ' +
			'renders that one stage with no Explorer UI around it. Prefer element ' +
			'screenshots over page or full-page screenshots — photographing the ' +
			'Explorer to inspect one small component costs hundreds of times more ' +
			'image tokens than photographing the component. Read ' +
			'sdocs://visual-testing-guide before your first capture.',
		inputSchema: {
			type: 'object',
			properties: {
				target: {
					type: 'string',
					description:
						'Stage name ("Button / Sizes" or "Sizes"), a site route, or a stage id ("sdocs:k3f9a")',
				},
				file: {
					type: 'string',
					description: 'Optional .sdoc file to search, when a name is ambiguous across files',
				},
			},
			required: ['target'],
		},
	},
	{
		name: 'get_component_api',
		description:
			"A Svelte component's full extracted API, exactly as sdocs documents it: " +
			'props (with types, defaults, descriptions), events, snippets, methods, ' +
			'states, CSS custom properties, and class/rest forwarding. Use it to ' +
			'read a component in this project without parsing the source yourself. ' +
			'Call as get_component_api({ componentPath: "src/Button/Button.svelte" }). ' +
			'A `warnings` array comes back when the source has props this reader ' +
			"could not see — an empty `props` without one means the component has none.",
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
		// The route each title actually produces, derived the same way the site
		// derives it. Slugs have a trap worth seeing before you commit to a
		// title: segments are lowercased whole, so CamelCase does not split —
		// "IconButton" becomes `iconbutton`, not `icon-button`.
		entities: doc.entities.map((e) => ({
			kind: e.kind,
			title: e.title,
			route: entityRoute(e.title, e.routeSlug),
		})),
	};
	return toolResult(result);
}

/** Where a title will be served from: `@section/` prefix, slugified folder
 * segments, then the `slug=` override or the slugified last segment. */
function entityRoute(title: string | null | undefined, routeSlug: string | null): string {
	const { section, rest } = splitSection(title);
	const segments = (rest || 'Untitled')
		.split('/')
		.map((s) => s.trim())
		.filter(Boolean);
	// A leading ':' marks a sidebar group, which is presentational and never
	// contributes a URL segment.
	const parts = segments.map((s, i) =>
		slugifySegment(i === 0 && s.startsWith(':') ? s.slice(1).trim() : s),
	);
	if (routeSlug && parts.length) parts[parts.length - 1] = routeSlug;
	return '/' + [...(section ? [slugifySegment(section)] : []), ...parts].join('/');
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
		// A scaffold built from zero props is a stub with no controls. Say why
		// here rather than let a count of 0 pass for an answer.
		...(data.warnings?.length ? { warnings: data.warnings } : {}),
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

/** One entity as both tools see it: what it is, where it serves, and every
 * name it can be found under. */
interface IndexedEntity {
	kind: string;
	title: string;
	route: string | null;
	components: { name: string; synonyms: string[] }[];
	examples: { name: string; route: string | null; tags: string[]; notes: DocNote[] }[];
	notes: DocNote[];
}

interface IndexedFile {
	file: string;
	valid: boolean;
	entities: IndexedEntity[];
}

/**
 * Read the project's docs once, resolved the way the site resolves them.
 *
 * Both `list_docs` and `search_docs` answer from this, so a route reported by
 * one is the route the other finds — the routes come from the Explorer's own
 * section builder, slug rules and `slug=` overrides included.
 */
async function collectDocIndex() {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);

	const parsed: { file: string; doc: ReturnType<typeof parseSdoc> }[] = [];
	const entries: DocEntry[] = [];

	for (const file of files) {
		const doc = parseSdoc(await readFile(file, 'utf-8'));
		parsed.push({ file, doc });
		for (const e of doc.entities) {
			entries.push({
				kind: ENTITY_KIND_TO_DOC_KIND[e.kind],
				filePath: file,
				routeSlug: e.routeSlug,
				hide: e.hide,
				meta: { title: e.title },
				examples: e.kind === 'SHOWCASE' ? e.examples.map((x) => ({ name: x.title })) : [],
			} as unknown as DocEntry);
		}
	}

	const map = buildSections(entries, { sections: config.sections, home: config.home });

	// Invert the route table: entity route (no snippet) and one per example.
	const routeOf = new Map<DocEntry, string>();
	const exampleRoutes = new Map<DocEntry, Map<string, string>>();
	for (const [route, target] of map.routes) {
		if (target.snippetName) {
			const byName = exampleRoutes.get(target.doc) ?? new Map<string, string>();
			byName.set(target.snippetName, `/${route}`);
			exampleRoutes.set(target.doc, byName);
		} else if (!routeOf.has(target.doc)) {
			routeOf.set(target.doc, `/${route}`);
		}
	}

	let cursor = 0;
	const indexed: IndexedFile[] = parsed.map(({ file, doc }) => ({
		file: relative(cwd, file),
		valid: doc.diagnostics.length === 0,
		entities: doc.entities.map((e) => {
			const entry = entries[cursor++];
			const routes = exampleRoutes.get(entry);
			return {
				kind: e.kind,
				title: e.title,
				route: routeOf.get(entry) ?? null,
				notes: e.notes,
				components:
					e.kind === 'SHOWCASE'
						? e.previews
								.filter((p) => p.componentName !== null)
								.map((p) => ({ name: p.componentName as string, synonyms: p.synonyms }))
						: [],
				examples:
					e.kind === 'SHOWCASE' || e.kind === 'DOC'
						? e.examples.map((x) => ({
								name: x.title,
								route: routes?.get(x.title) ?? null,
								tags: x.tags,
								notes: x.notes,
							}))
						: [],
			};
		}),
	}));

	return { cwd, config, files, indexed, structureErrors: map.errors.map((e) => e.message) };
}

async function listDocs() {
	const { cwd, config, files, indexed, structureErrors } = await collectDocIndex();

	const docs = indexed.map((f) => ({
		file: f.file,
		valid: f.valid,
		entities: f.entities.map((e) => {
			const synonyms = e.components.filter((c) => c.synonyms.length);
			const examples = e.examples.filter((x) => x.route !== null);
			return {
				kind: e.kind,
				title: e.title,
				route: e.route,
				...(e.components.length ? { components: e.components.map((c) => c.name) } : {}),
				// Only what the author actually wrote — an empty list on every
				// entity is noise in a map meant to be read at a glance.
				...(synonyms.length
					? { synonyms: synonyms.map((c) => ({ component: c.name, names: c.synonyms })) }
					: {}),
				...(e.notes.length ? { notes: e.notes } : {}),
				...(examples.length
					? {
							examples: examples.map((x) => ({
								name: x.name,
								route: x.route as string,
								...(x.tags.length ? { tags: x.tags } : {}),
								...(x.notes.length ? { notes: x.notes } : {}),
							})),
						}
					: {}),
			};
		}),
	}));

	return toolResult({
		project: cwd,
		include: config.include,
		count: files.length,
		// The vocabulary for a stage page's ?axis-<id>= parameters. Without it a
		// client can't know this project has a 'density' axis, let alone that
		// 'compact' is one of its values.
		...(config.axes.length
			? { axes: config.axes.map((a) => ({ id: a.id, values: a.values })) }
			: {}),
		docs,
		...(structureErrors.length ? { structureErrors } : {}),
	});
}

/**
 * Find documentation by any name it goes under: the entity's title, a
 * component it previews, that component's `synonyms`, an example's title, or
 * an example's `tags`.
 *
 * Matching is a case-insensitive substring, deliberately: an agent looking for
 * a button rarely knows whether the project calls it Button, ButtonGroup or
 * "btn", and a search that only answers to whole words sends it back to
 * reading files. Every hit says which name matched, so a surprising result
 * explains itself.
 */
/** The intent of a note as the filter names it — an unset one is 'none'. */
function intentName(note: DocNote): string {
	return note.intent ?? 'none';
}

/** Why an intent filter kept a result, reported alongside the query's hits. */
function intentHits(notes: DocNote[], intent: string): string[] {
	if (!intent) return [];
	return notes
		.filter((n) => intentName(n) === intent)
		.map((n) => `note intent: ${intentName(n)}`);
}

async function searchDocs(params: Record<string, unknown>) {
	const raw = typeof params.query === 'string' ? params.query.trim() : '';
	const intent = typeof params.intent === 'string' ? params.intent.trim() : '';
	// One or the other is enough: a text search, a sweep of everything marked
	// danger, or both together.
	if (!raw && !intent) {
		return invalidParams('search_docs needs a query, an intent, or both');
	}
	if (intent && !SEARCH_INTENTS.includes(intent)) {
		return invalidParams(`intent must be one of ${SEARCH_INTENTS.join(', ')}`);
	}
	const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : SEARCH_LIMIT;
	const needle = raw.toLowerCase();
	const hits = (text: string) => !!needle && text.toLowerCase().includes(needle);
	/** With both given, a result has to satisfy both. */
	const keep = (matched: string[], notes: DocNote[]) => {
		if (raw && !matched.length) return false;
		if (intent && !notes.some((n) => intentName(n) === intent)) return false;
		return true;
	};

	const { indexed } = await collectDocIndex();
	const results: Record<string, unknown>[] = [];

	for (const file of indexed) {
		for (const entity of file.entities) {
			const matched: string[] = [];
			if (hits(entity.title)) matched.push('title');
			for (const component of entity.components) {
				if (hits(component.name)) matched.push(`component: ${component.name}`);
				for (const synonym of component.synonyms) {
					if (hits(synonym)) matched.push(`synonym: ${synonym}`);
				}
			}
			for (const note of entity.notes) {
				if (hits(note.note)) matched.push(`note: ${note.note}`);
			}
			// Kept apart from the query's hits until the decision is made: an
			// intent match must not stand in for the text the caller asked for.
			const byIntent = intentHits(entity.notes, intent);
			if (keep(matched, entity.notes)) {
				results.push({
					kind: entity.kind,
					title: entity.title,
					file: file.file,
					route: entity.route,
					...(entity.components.length
						? { components: entity.components.map((c) => c.name) }
						: {}),
					...(entity.notes.length ? { notes: entity.notes } : {}),
					matched: [...matched, ...byIntent],
				});
			}

			for (const example of entity.examples) {
				const why: string[] = [];
				if (hits(example.name)) why.push('title');
				for (const tag of example.tags) {
					if (hits(tag)) why.push(`tag: ${tag}`);
				}
				for (const note of example.notes) {
					if (hits(note.note)) why.push(`note: ${note.note}`);
				}
				const whyIntent = intentHits(example.notes, intent);
				if (!keep(why, example.notes)) continue;
				results.push({
					kind: 'example',
					title: `${entity.title} / ${example.name}`,
					file: file.file,
					// A [DOC]'s examples have no route of their own; the doc's
					// own route is where the reader goes to find them.
					route: example.route ?? entity.route,
					...(example.tags.length ? { tags: example.tags } : {}),
					...(example.notes.length ? { notes: example.notes } : {}),
					matched: [...why, ...whyIntent],
				});
			}
		}
	}

	return toolResult({
		...(raw ? { query: raw } : {}),
		...(intent ? { intent } : {}),
		total: results.length,
		// Say so rather than quietly serving a slice — a caller that sees 50
		// results and no note reads it as "that is all of them".
		...(results.length > limit ? { truncated: results.length - limit, limit } : {}),
		results: results.slice(0, limit),
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
		// Present only when the extraction is thinner than the source looks.
		// An empty `props` with nothing beside it means the component has none.
		...(data.warnings?.length ? { warnings: data.warnings } : {}),
	});
}

/**
 * The single component a body is built around, or null when there isn't one.
 *
 * A layout that renders one component is answering "what is this a layout of?"
 * unambiguously, and reporting that `.svelte` completes the source trail. A
 * body wrapping several distinct components isn't answering it — naming one of
 * them would send someone to edit the wrong file, so it names none.
 */
function soleComponentRoot(body: string): string | null {
	const names = new Set<string>();
	// Component tags are capitalised or dotted; plain HTML never is.
	for (const m of body.matchAll(/<([A-Z][\w]*(?:\.[A-Z][\w]*)*)\b/g)) names.add(m[1]);
	return names.size === 1 ? [...names][0] : null;
}

/** Where a site route points: the entity, and which of its stages is "the"
 * stage for that route. An entity route has no snippet of its own, so a
 * SHOWCASE resolves to its first [component] preview and a LAYOUT to its body;
 * a DOC or PAGE has no preview page at all — its prose renders natively inside
 * the Explorer — which is an answer, not a failure to match. */
interface RouteTarget {
	file: string;
	entitySlug: string;
	snippetName: string | null;
	kind: string;
	entityTitle: string;
	/** Set when the route resolves to an entity that has no photographable
	 * stage, so the caller is told why rather than handed a null. */
	noStageReason?: string;
	exampleRoutes?: string[];
}

async function routeToStage(
	route: string,
	cwd: string,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<RouteTarget | null> {
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);
	const entries: DocEntry[] = [];
	const meta = new Map<DocEntry, { file: string; kind: string; title: string; slug: string }>();
	for (const file of files) {
		const doc = parseSdoc(await readFile(file, 'utf-8'));
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
			meta.set(entry, { file, kind: e.kind, title: e.title, slug: e.slug });
		}
	}
	const map = buildSections(entries, { sections: config.sections, home: config.home });
	const wanted = route.replace(/^\/+|\/+$/g, '');
	const target = map.routes.get(wanted);
	if (!target) return null;
	const info = meta.get(target.doc);
	if (!info) return null;

	const base: RouteTarget = {
		file: info.file,
		entitySlug: info.slug,
		snippetName: target.snippetName ?? null,
		kind: info.kind,
		entityTitle: info.title,
	};
	if (target.snippetName) return base;
	// An entity route: pick the stage that *is* the entity.
	if (info.kind === 'SHOWCASE' || info.kind === 'LAYOUT') return base;
	const examples: string[] = [];
	for (const [r, t] of map.routes) {
		if (t.doc === target.doc && t.snippetName) examples.push(`/${r}`);
	}
	return {
		...base,
		noStageReason:
			`${info.kind} bodies render natively inside the Explorer and have no ` +
			'preview page of their own. Its examples do.',
		exampleRoutes: examples,
	};
}

/**
 * Resolve a human's way of naming a stage — "Button / Sizes", a route, or the
 * id printed under it — to the machine's: a preview-only URL, the files behind
 * it, and the room the author reserved around it.
 *
 * The point is that a client never has to reproduce the slug rules or decode a
 * route to look at one component, and never has to guess which file to edit
 * once it sees the problem.
 */
async function resolveVisualTarget(params: Record<string, unknown>) {
	const raw = typeof params.target === 'string' ? params.target.trim() : '';
	if (!raw) throw new RpcError(-32602, 'target is required');
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);

	const needle = raw.replace(/^sdocs:/i, '').trim();
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	const wanted = norm(needle);
	const onlyFile = typeof params.file === 'string' && params.file ? params.file : null;

	// Routes are matched against the router's own table, not guessed at by
	// flattening a path into words. A route is an exact address — treating it
	// as a fuzzy name made `/atoms/button/sizes` appear to work (its segments
	// happen to spell the stage) while `/atoms/button` matched nothing, which
	// reads as a broken tool rather than an unsupported input.
	const routeTarget = needle.startsWith('/')
		? await routeToStage(needle, cwd, config)
		: null;

	interface Candidate {
		score: number;
		payload: Record<string, unknown>;
	}
	const candidates: Candidate[] = [];

	for (const file of files) {
		const rel = relative(cwd, file);
		if (onlyFile && rel !== onlyFile && file !== resolve(cwd, onlyFile)) continue;
		const source = await readFile(file, 'utf-8');
		const doc = parseSdoc(source);
		const fileImports = extractImports(doc.script?.content ?? '');

		for (const entity of doc.entities) {
			const planned = planIframeSnippets(entity);
			const stages = describeStages(entity, planned, file);
			const entityImports = extractImports(entity.script?.content ?? '');
			const blocks = new Map<string, { componentName?: string | null; args?: unknown; sizing?: unknown; script?: { content: string } | null; line?: number }>();
			if (entity.kind === 'SHOWCASE') {
				for (const p of entity.previews) {
					blocks.set(previewSlug(p.label), {
						componentName: p.componentName,
						args: p.args ?? null,
						sizing: p.sizing,
						script: p.script,
						line: offsetToPosition(source, p.span.start).line + 1,
					});
				}
			}
			// A LAYOUT's body is a stage too, and it had no entry here — so its
			// result carried no line and no component, which is precisely the
			// trail someone asked to "look at this layout" needs.
			if (entity.kind === 'LAYOUT' || entity.kind === 'PAGE') {
				blocks.set('content', {
					sizing: entity.sizing,
					script: entity.script,
					line: offsetToPosition(source, entity.span.start).line + 1,
					componentName: soleComponentRoot(entity.body ?? ''),
				});
			}
			const entityExamples = 'examples' in entity ? entity.examples : [];
			for (const ex of entityExamples) {
				const slug = exampleSlug(ex.title);
				if (!blocks.has(slug)) {
					blocks.set(slug, {
						sizing: ex.sizing,
						script: ex.script,
						line: offsetToPosition(source, ex.span.start).line + 1,
					});
				}
			}

			for (const [i, stage] of stages.entries()) {
				const plan = planned[i];
				const block = blocks.get(stage.slug);
				// "Button / Sizes" and "Sizes" both name this stage; so does the id.
				const entityName = entity.title.split('/').pop()?.trim() ?? entity.title;
				const full = norm(`${entityName} ${stage.name}`);
				const short = norm(stage.name);
				let score = 0;
				const routeHit =
					routeTarget &&
					routeTarget.file === file &&
					routeTarget.entitySlug === entity.slug &&
					(routeTarget.snippetName === null ||
						routeTarget.snippetName === stage.name ||
						routeTarget.snippetName === stage.slug);
				if (routeHit) score = 110;
				else if (routeTarget) score = 0;
				else if (stage.id === needle) score = 100;
				else if (full === wanted) score = 90;
				else if (norm(entity.title + ' ' + stage.name) === wanted) score = 85;
				else if (short === wanted) score = 70;
				else if (full.includes(wanted) || wanted.includes(full)) score = 50;
				else if (short.includes(wanted)) score = 30;
				if (routeHit && routeTarget?.snippetName === null && plan?.role === 'example') {
					// The entity route means the entity, not one of its examples.
					score = 0;
				}
				if (!score) continue;

				const componentPath = block?.componentName
					? resolveComponentImport(
							block.componentName,
							[
								...extractImports(block.script?.content ?? ''),
								...entityImports,
								...fileImports,
							],
							file,
						)
					: null;

				candidates.push({
					score,
					payload: {
						stageId: stage.id,
						name: stage.name,
						kind: stage.kind,
						component: stage.component,
						entity: entity.title,
						// Where to point a browser. Relative on purpose: it works at
						// whatever host, port, or base the site is actually served on.
						previewRoute: previewUrl(file, entity.slug, stage.slug),
						builtPreviewPath: buildPreviewUrl(file, entity.slug, stage.slug),
						readySelector: '[data-sdocs-stage-ready]',
						stageSelector: '#sdocs-preview',
						source: {
							component: componentPath ? relative(cwd, componentPath) : null,
							doc: rel,
							line: block?.line ?? null,
						},
						args: (block?.args as Record<string, unknown> | null) ?? null,
						// The author's own answer to "how much room does this need?" —
						// a stage with padding already holds the component's shadow or
						// glow, so the stage is the safe thing to capture.
						stageLayout: resolveStageLayout(
							entity as never,
							(block?.sizing as never) ?? undefined,
							config,
						),
						role: plan?.role ?? stage.kind,
					},
				});
			}
		}
	}

	if (candidates.length === 0 && routeTarget?.noStageReason) {
		return toolResult({
			target: raw,
			resolved: null,
			entity: routeTarget.entityTitle,
			kind: routeTarget.kind,
			doc: relative(cwd, routeTarget.file),
			reason: routeTarget.noStageReason,
			...(routeTarget.exampleRoutes?.length ? { exampleRoutes: routeTarget.exampleRoutes } : {}),
		});
	}
	if (candidates.length === 0) {
		return toolResult({
			target: raw,
			resolved: null,
			hint:
				'Nothing matched. list_docs shows every entity and example by name; ' +
				'a stage id is the code shown under a preview in the dev Explorer.',
		});
	}
	candidates.sort((a, b) => b.score - a.score);
	const best = candidates[0].score;
	const top = candidates.filter((c) => c.score === best).map((c) => c.payload);
	return toolResult({
		target: raw,
		// Ambiguity is reported, never guessed away: two stages can legitimately
		// share a name across files, and picking one silently sends an agent to
		// edit the wrong component.
		resolved: top.length === 1 ? top[0] : null,
		...(top.length > 1 ? { ambiguous: top } : {}),
		...(candidates.length > top.length
			? { alsoMatched: candidates.slice(top.length, top.length + 5).map((c) => c.payload.stageId) }
			: {}),
	});
}

async function checkDocs(params: Record<string, unknown>) {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const file = params.file;
	let files: string[];
	if (typeof file === 'string' && file) {
		files = [isAbsolute(file) ? file : resolve(cwd, file)];
	} else {
		files = await discoverDocFiles(
			config.include.map((p) => resolve(cwd, p)),
			cwd,
		);
	}
	const result = await checkDocFiles(files, cwd);
	const errors = result.problems.filter((p) => p.severity === 'error');
	return toolResult({
		ok: result.ok,
		checked: result.checked,
		errorCount: errors.length,
		warningCount: result.problems.length - errors.length,
		problems: result.problems,
		note: result.ok
			? 'Every stage compiles. This does not type-check, and cannot see runtime-only failures.'
			: 'Fix the errors and run check_docs again.',
	});
}

async function checkCoverage() {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);
	const result = await measureCoverage(files, config.components, cwd);
	return toolResult({
		...result,
		note:
			result.counts.components === 0
				? 'No component files matched — set `components` in sdocs.config.js to the globs locating them.'
				: 'Undocumented components have no [component] preview. A compound family is measured per sub-component.',
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
				case 'search_docs':
					return searchDocs(args);
				case 'get_component_api':
					return getComponentApi(args);
				case 'check_docs':
					return checkDocs(args);
				case 'check_coverage':
					return checkCoverage();
				case 'resolve_visual_target':
					return resolveVisualTarget(args);
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
					{
						uri: VISUAL_URI,
						name: 'visual-testing-guide',
						title: 'Inspecting sdocs previews with a browser',
						description:
							'How to photograph one component instead of the whole Explorer: ' +
							'preview-only routes, the ready marker, and capturing shadows ' +
							'and glows without clipping them.',
						mimeType: 'text/markdown',
					},
				],
			};
		case 'resources/read': {
			if (params.uri === VISUAL_URI) {
				return {
					contents: [
						{ uri: VISUAL_URI, mimeType: 'text/markdown', text: VISUAL_TESTING_GUIDE },
					],
				};
			}
			if (params.uri !== GUIDE_URI) {
				throw new RpcError(-32002, `Unknown resource "${String(params.uri)}"`);
			}
			return { contents: [{ uri: GUIDE_URI, mimeType: 'text/markdown', text: authoringGuide() }] };
		}
		default:
			throw new RpcError(-32601, `Method not found: ${method}`);
	}
}
