/**
 * Semantic layer over the syntactic scanner: validates attributes against
 * the sdoc language rules and produces typed entities ready for the Vite
 * plugin, the CLI app-gen, and the editor tooling.
 */

import {
	scanSdoc,
	type Attrs,
	type AttrValue,
	type Entity,
	type ScanError,
	type SdocFile,
	type Span,
	type SubBlock,
	type TagBlock,
} from './scanner.js';

export type ArgValue = string | number | boolean;

/** Explicit presentation overrides from stage attributes */
export interface Sizing {
	maxWidth: string | null;
	padding: string | null;
	/** flex-direction of preview/example stages */
	direction: string | null;
	/** gap of preview/example stages */
	gap: string | null;
	/** horizontal alignment of preview/example stage contents */
	contentX: string | null;
	/** vertical alignment of preview/example stage contents */
	contentY: string | null;
	/** table-of-contents visibility (PAGE) */
	toc: boolean | null;
}

export interface PreviewBlock {
	/** The identifier from component={X}; null when invalid/missing (already reported) */
	componentName: string | null;
	/** Parsed args literal; null when absent or invalid */
	args: Record<string, ArgValue> | null;
	/** Exact source of the args expression (inner object), for code display */
	argsRaw: string | null;
	/** Explicit title="…" override, when present */
	title: string | null;
	/** Tab label: the title override or the component name */
	label: string;
	sizing: Sizing;
	body: string;
	bodySpan: Span;
	span: Span;
}

export interface ExampleBlock {
	title: string;
	sizing: Sizing;
	body: string;
	bodySpan: Span;
	span: Span;
}

export interface DocsEntity {
	kind: 'DOCS';
	title: string;
	slug: string;
	description: string | null;
	sizing: Sizing;
	previews: PreviewBlock[];
	examples: ExampleBlock[];
	openerSpan: Span;
	span: Span;
}

export interface PageEntity {
	kind: 'PAGE';
	title: string;
	slug: string;
	sizing: Sizing;
	/** Prose body with each [example] block replaced by a
	 * `{@render __sdocsExample?.(i)}` marker the page renderer resolves. */
	body: string;
	/** The page's [example] blocks, in marker order */
	examples: ExampleBlock[];
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

export interface LayoutEntity {
	kind: 'LAYOUT';
	title: string;
	slug: string;
	sizing: Sizing;
	body: string;
	bodySpan: Span;
	openerSpan: Span;
	span: Span;
}

export type SdocEntity = DocsEntity | PageEntity | LayoutEntity;

export interface SdocDocument {
	script: TagBlock | null;
	style: TagBlock | null;
	entities: SdocEntity[];
	diagnostics: ScanError[];
	source: string;
}

/**
 * Normalize a raw block body for consumption: strip the common leading
 * indentation (bodies sit one level deep inside their block), drop a
 * trailing carriage return per line, and unescape lines that start with
 * `\[` (the escape for body lines that would otherwise read as tags).
 * The scanner keeps the raw text and spans; this is the display/runtime form.
 */
export function normalizeBody(raw: string): string {
	const lines = raw.split('\n').map((line) => line.replace(/\r$/, ''));
	let common: string | null = null;
	for (const line of lines) {
		if (line.trim() === '') continue;
		const indent = line.match(/^[ \t]*/)![0];
		if (common === null) {
			common = indent;
		} else {
			let k = 0;
			while (k < common.length && k < indent.length && common[k] === indent[k]) k++;
			common = common.slice(0, k);
		}
	}
	const cut = common?.length ?? 0;
	return lines
		.map((line) => (line.trim() === '' ? '' : line.slice(cut)))
		.map((line) => (line.startsWith('\\[') ? line.slice(1) : line))
		.join('\n')
		.replace(/^\n+|\n+$/g, '');
}

/** Slug used for entity addressing: relPath + '#' + slug. */
export function slugifyTitle(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'untitled'
	);
}

const IDENTIFIER_RE = /^[A-Z][A-Za-z0-9_]*$/;

export interface AttrRule {
	/** required | optional */
	required: boolean;
	/** expected value kind */
	kind: 'string' | 'expression';
	hint: string;
}

const SIZING_ATTR_RULES: Record<string, AttrRule> = {
	maxWidth: { required: false, kind: 'string', hint: 'maxWidth="1200px"' },
	padding: { required: false, kind: 'string', hint: 'padding="32px"' },
};

const STAGE_LAYOUT_ATTR_RULES: Record<string, AttrRule> = {
	direction: { required: false, kind: 'string', hint: 'direction="column"' },
	gap: { required: false, kind: 'string', hint: 'gap="16px"' },
	contentX: { required: false, kind: 'string', hint: 'contentX="center"' },
	contentY: { required: false, kind: 'string', hint: 'contentY="middle"' },
};

function sizingOf(attrs: Attrs): Sizing {
	const toc = stringAttr(attrs, 'toc');
	return {
		maxWidth: stringAttr(attrs, 'maxWidth'),
		padding: stringAttr(attrs, 'padding'),
		direction: stringAttr(attrs, 'direction'),
		gap: stringAttr(attrs, 'gap'),
		contentX: stringAttr(attrs, 'contentX'),
		contentY: stringAttr(attrs, 'contentY'),
		toc: toc === null ? null : toc === 'true',
	};
}

const ENTITY_ATTR_RULES: Record<string, Record<string, AttrRule>> = {
	DOCS: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		description: { required: false, kind: 'string', hint: 'description="…"' },
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
	PAGE: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		...SIZING_ATTR_RULES,
		// On PAGE, contentX aligns the content column (with its toc), not a stage.
		contentX: { required: false, kind: 'string', hint: 'contentX="center"' },
		toc: { required: false, kind: 'string', hint: 'toc="false"' },
	},
	LAYOUT: {
		title: { required: true, kind: 'string', hint: 'title="Group / Name"' },
		...SIZING_ATTR_RULES,
	},
};

const SUB_BLOCK_ATTR_RULES: Record<string, Record<string, AttrRule>> = {
	preview: {
		component: { required: true, kind: 'expression', hint: 'component={Button}' },
		args: { required: false, kind: 'expression', hint: 'args={{ label: "Hi" }}' },
		title: { required: false, kind: 'string', hint: 'title="…"' },
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
	example: {
		title: { required: true, kind: 'string', hint: 'title="…"' },
		...SIZING_ATTR_RULES,
		...STAGE_LAYOUT_ATTR_RULES,
	},
};

/** Allowed attributes and their value shapes for a block, keyed by kind
 * ('DOCS'|'PAGE'|'LAYOUT'|'preview'|'example'). Single source of truth for
 * both diagnostics and editor attribute completions. */
export function attributeRules(kind: string): Record<string, AttrRule> {
	return ENTITY_ATTR_RULES[kind] ?? SUB_BLOCK_ATTR_RULES[kind] ?? {};
}

function checkAttrs(
	owner: string,
	attrs: Attrs,
	rules: Record<string, AttrRule>,
	ownerSpan: Span,
	diagnostics: ScanError[],
): void {
	for (const [name, value] of Object.entries(attrs)) {
		const rule = rules[name];
		if (!rule) {
			diagnostics.push({
				code: 'unknown-attr',
				message: `Unknown attribute "${name}" on ${owner}. Allowed: ${Object.keys(rules).join(', ')}.`,
				span: value.span,
			});
			continue;
		}
		if (value.kind !== rule.kind) {
			diagnostics.push({
				code: 'attr-value-kind',
				message: `Attribute "${name}" on ${owner} must be written ${rule.hint}.`,
				span: value.span,
			});
		}
	}
	for (const [name, rule] of Object.entries(rules)) {
		if (rule.required && !attrs[name]) {
			diagnostics.push({
				code: 'missing-attr',
				message: `${owner} requires ${rule.hint}.`,
				span: ownerSpan,
			});
		}
	}
}

function stringAttr(attrs: Attrs, name: string): string | null {
	const v = attrs[name];
	return v && v.kind === 'string' ? v.raw : null;
}

/**
 * Parse a preview args expression: a flat object literal whose values are
 * plain literals (strings, numbers, booleans). Anything richer belongs in
 * the block body, so it is rejected here.
 */
export function parseArgsLiteral(
	raw: string,
	span: Span,
	diagnostics: ScanError[],
): Record<string, ArgValue> | null {
	const fail = (message: string): null => {
		diagnostics.push({ code: 'args-literal', message, span });
		return null;
	};
	let i = 0;
	const ws = () => {
		while (i < raw.length && /\s/.test(raw[i])) i++;
	};
	ws();
	if (raw[i] !== '{') return fail('args must be an object literal: args={{ name: value }}.');
	i++;
	const values: Record<string, ArgValue> = {};
	ws();
	while (i < raw.length && raw[i] !== '}') {
		const keyMatch = raw.slice(i).match(/^([A-Za-z_$][A-Za-z0-9_$]*|'[^']*'|"[^"]*")\s*:/);
		if (!keyMatch) return fail('args keys must be plain names, like args={{ label: "Hi" }}.');
		const key = keyMatch[1].replace(/^['"]|['"]$/g, '');
		i += keyMatch[0].length;
		ws();
		const rest = raw.slice(i);
		let m: RegExpMatchArray | null;
		if ((m = rest.match(/^'((?:[^'\\]|\\.)*)'/)) || (m = rest.match(/^"((?:[^"\\]|\\.)*)"/))) {
			values[key] = m[1].replace(/\\(.)/g, '$1');
			i += m[0].length;
		} else if ((m = rest.match(/^-?\d+(\.\d+)?/))) {
			values[key] = Number(m[0]);
			i += m[0].length;
		} else if ((m = rest.match(/^(true|false)\b/))) {
			values[key] = m[0] === 'true';
			i += m[0].length;
		} else {
			return fail(
				`args value for "${key}" must be a plain literal (string, number, or boolean); richer values go in the block body.`,
			);
		}
		ws();
		if (raw[i] === ',') {
			i++;
			ws();
		} else if (raw[i] !== '}') {
			return fail('args entries must be separated by commas.');
		}
	}
	if (raw[i] !== '}') return fail('args object literal is missing its closing "}".');
	i++;
	ws();
	if (i !== raw.length) return fail('Unexpected text after the args object literal.');
	return values;
}

function parsePreview(block: SubBlock, diagnostics: ScanError[]): PreviewBlock {
	checkAttrs('[preview]', block.attrs, SUB_BLOCK_ATTR_RULES.preview, block.openerSpan, diagnostics);

	let componentName: string | null = null;
	const component = block.attrs.component;
	if (component && component.kind === 'expression') {
		const name = component.raw.trim();
		if (IDENTIFIER_RE.test(name)) {
			componentName = name;
		} else {
			diagnostics.push({
				code: 'component-identifier',
				message:
					'component must be a component identifier imported in the file\'s <script>, like component={Button}.',
				span: component.valueSpan,
			});
		}
	}

	let args: Record<string, ArgValue> | null = null;
	let argsRaw: string | null = null;
	const argsAttr = block.attrs.args;
	if (argsAttr && argsAttr.kind === 'expression') {
		argsRaw = argsAttr.raw.trim();
		args = parseArgsLiteral(argsAttr.raw, argsAttr.valueSpan, diagnostics);
	}

	const title = stringAttr(block.attrs, 'title');
	return {
		componentName,
		args,
		argsRaw,
		title,
		label: title ?? componentName ?? 'Preview',
		sizing: sizingOf(block.attrs),
		body: normalizeBody(block.body),
		bodySpan: block.bodySpan,
		span: block.span,
	};
}

function parseExample(
	block: SubBlock,
	seenTitles: Set<string>,
	owner: 'DOCS' | 'PAGE',
	diagnostics: ScanError[],
): ExampleBlock {
	checkAttrs('[example]', block.attrs, SUB_BLOCK_ATTR_RULES.example, block.openerSpan, diagnostics);
	const title = stringAttr(block.attrs, 'title') ?? '';
	if (title && seenTitles.has(title)) {
		diagnostics.push({
			code: 'duplicate-example-title',
			message: `Duplicate example title "${title}" — titles are unique within a [${owner}] block.`,
			span: block.openerSpan,
		});
	}
	seenTitles.add(title);
	return {
		title,
		sizing: sizingOf(block.attrs),
		body: normalizeBody(block.body),
		bodySpan: block.bodySpan,
		span: block.span,
	};
}

function parseDocs(entity: Entity, diagnostics: ScanError[]): DocsEntity {
	checkAttrs('[DOCS]', entity.attrs, ENTITY_ATTR_RULES.DOCS, entity.openerSpan, diagnostics);
	const previews: PreviewBlock[] = [];
	const examples: ExampleBlock[] = [];
	const exampleTitles = new Set<string>();
	const previewLabels = new Set<string>();

	for (const block of entity.blocks) {
		if (block.kind === 'preview') {
			const preview = parsePreview(block, diagnostics);
			if (previewLabels.has(preview.label)) {
				diagnostics.push({
					code: 'duplicate-preview-label',
					message: `Two previews are both labeled "${preview.label}" — give one a title="…".`,
					span: block.openerSpan,
				});
			}
			previewLabels.add(preview.label);
			previews.push(preview);
		} else {
			examples.push(parseExample(block, exampleTitles, 'DOCS', diagnostics));
		}
	}

	const title = stringAttr(entity.attrs, 'title') ?? '';
	return {
		kind: 'DOCS',
		title,
		slug: slugifyTitle(title),
		description: stringAttr(entity.attrs, 'description'),
		sizing: sizingOf(entity.attrs),
		previews,
		examples,
		openerSpan: entity.openerSpan,
		span: entity.span,
	};
}

/**
 * Replace each [example] block in a PAGE's raw body with a
 * `{@render __sdocsExample?.(i)}` marker at the opener's indentation, so the
 * markdown renderer passes it through verbatim and the Explorer renders the
 * example's stage in place.
 */
function spliceExampleMarkers(entity: Entity): string {
	if (entity.blocks.length === 0) return entity.body;
	let out = '';
	let from = 0;
	entity.blocks.forEach((block, i) => {
		const before = entity.body.slice(from, block.span.start - entity.bodySpan.start);
		const indent = before.slice(before.lastIndexOf('\n') + 1);
		out += before.slice(0, before.length - indent.length);
		out += `${indent}{@render __sdocsExample?.(${i})}`;
		from = block.span.end - entity.bodySpan.start;
	});
	out += entity.body.slice(from);
	return out;
}

function parsePage(entity: Entity, diagnostics: ScanError[]): PageEntity {
	checkAttrs('[PAGE]', entity.attrs, ENTITY_ATTR_RULES.PAGE, entity.openerSpan, diagnostics);
	const examples: ExampleBlock[] = [];
	const exampleTitles = new Set<string>();
	for (const block of entity.blocks) {
		examples.push(parseExample(block, exampleTitles, 'PAGE', diagnostics));
	}
	const title = stringAttr(entity.attrs, 'title') ?? '';
	return {
		kind: 'PAGE',
		title,
		slug: slugifyTitle(title),
		sizing: sizingOf(entity.attrs),
		body: normalizeBody(spliceExampleMarkers(entity)),
		examples,
		bodySpan: entity.bodySpan,
		openerSpan: entity.openerSpan,
		span: entity.span,
	};
}

export function parseSdoc(source: string): SdocDocument {
	const scanned: SdocFile = scanSdoc(source);
	const diagnostics: ScanError[] = [...scanned.errors];
	const entities: SdocEntity[] = [];
	const slugs = new Set<string>();

	for (const entity of scanned.entities) {
		let typed: SdocEntity;
		if (entity.kind === 'DOCS') {
			typed = parseDocs(entity, diagnostics);
		} else if (entity.kind === 'PAGE') {
			typed = parsePage(entity, diagnostics);
		} else {
			checkAttrs('[LAYOUT]', entity.attrs, ENTITY_ATTR_RULES.LAYOUT, entity.openerSpan, diagnostics);
			const title = stringAttr(entity.attrs, 'title') ?? '';
			typed = {
				kind: 'LAYOUT',
				title,
				slug: slugifyTitle(title),
				sizing: sizingOf(entity.attrs),
				body: normalizeBody(entity.body),
				bodySpan: entity.bodySpan,
				openerSpan: entity.openerSpan,
				span: entity.span,
			};
		}
		if (slugs.has(typed.slug)) {
			diagnostics.push({
				code: 'duplicate-entity-title',
				message: `Two entities in this file resolve to the same address ("${typed.slug}") — make their titles distinct.`,
				span: typed.openerSpan,
			});
		}
		slugs.add(typed.slug);
		entities.push(typed);
	}

	return {
		script: scanned.script,
		style: scanned.style,
		entities,
		diagnostics,
		source,
	};
}
