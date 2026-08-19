import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import type {
	ParsedProp,
	ParsedMethod,
	ParsedState,
	ParsedCssProp,
	ComponentData,
} from '../types.js';

/** Parse all component data from a Svelte component file */
export async function parseComponent(filePath: string): Promise<ComponentData> {
	const source = await readFile(filePath, 'utf-8');
	return parseComponentSource(source);
}

/** Parse component data from source */
export function parseComponentSource(source: string): ComponentData {
	const scriptContent = extractScriptContent(source);
	const styleContent = extractStyleContent(source);

	let props: ParsedProp[] = [];
	let methods: ParsedMethod[] = [];
	let state: ParsedState[] = [];
	let acceptsClass = false;
	let forwardsRest = false;
	let restType: string | null = null;
	const warnings: string[] = [];

	if (scriptContent) {
		const tsAst = ts.createSourceFile(
			'component.ts',
			scriptContent,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);

		// Destructuring first: it carries the name of the props type, which is
		// what the interface reader should look for.
		const destructured = parsePropsDestructuring(tsAst);
		const aliases = literalUnionAliases(tsAst);
		const interfaceProps = parseInterfaceProps(tsAst, destructured.typeName, aliases);
		const jsdocTypeProps = parseJsdocTypeProps(tsAst);
		const jsdocData = parseJsdocComments(tsAst);
		// TS interface wins over JSDoc types when both exist (they shouldn't).
		const interfaceNames = new Set(interfaceProps.map((p) => p.name));
		const typedProps = [
			...interfaceProps,
			...jsdocTypeProps.filter((p) => !interfaceNames.has(p.name)),
		];
		// `class` is forwarding infrastructure, not API — surfaced as a flag
		// (rendered as a chip), never as a prop row, wherever it's declared.
		acceptsClass = destructured.acceptsClass || typedProps.some((p) => p.name === 'class');
		forwardsRest = destructured.forwardsRest;
		restType = forwardsRest ? parsePropsHeritage(tsAst, destructured.typeName) : null;
		props = mergeProps(
			typedProps.filter((p) => p.name !== 'class'),
			destructured.props,
			jsdocData,
			typedProps.length > 0,
		);
		methods = parseExportedFunctions(tsAst);
		state = parseExportedState(tsAst);

		// The expensive silence: extraction that comes back thinner than the
		// source, with nothing to distinguish it from a component that really
		// is that simple. Defaults live in the destructuring, so a $props()
		// bound to a name has none to read — and if there's no props type to
		// fall back on either, the whole API comes back empty.
		if (destructured.boundWithoutDestructuring) {
			warnings.push(
				props.length === 0
					? '$props() is bound to a name rather than destructured, and no props type was found ' +
						'to read instead, so nothing was extracted. sdocs reads props from ' +
						'`let { a, b = 1 }: Props = $props()`.'
					: `Prop defaults were not read: they live in the \`$props()\` destructuring, and this ` +
						`component binds \`$props()\` to a name. The ${props.length} prop(s) below come from ` +
						`\`${destructured.typeName ?? 'the props type'}\`, so their types are right but every ` +
						'default shows as none.',
			);
		}
	}

	const cssProps = styleContent ? parseCssProps(source, styleContent) : [];

	return {
		props,
		methods,
		state,
		cssProps,
		acceptsClass,
		forwardsRest,
		restType,
		...(warnings.length ? { warnings } : {}),
	};
}

// ─── Script extraction ───

function extractScriptContent(source: string): string | null {
	// A component may carry both a module (`<script module>`) and an instance
	// `<script>`; the `Props` interface and `$props()` live in the instance one.
	// Concatenate every block so parsing sees the whole script surface whatever
	// the order — otherwise a leading `<script module>` hides the props.
	const blocks = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	return blocks.length ? blocks.join('\n') : null;
}

function extractStyleContent(source: string): string | null {
	const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	return match ? match[1] : null;
}

// ─── Interface Props parsing ───

/**
 * Same-file type aliases that name a union of literals.
 *
 * A package that exports its vocabulary by name — `export type ButtonVariant =
 * 'primary' | 'secondary'` — used to document `variant` as the bare word
 * `ButtonVariant`: no visible set of allowed values, and no select control,
 * because the control is derived from the type text. Inlining the union in the
 * interface brought both back at the cost of duplicating a type the package
 * still wants to export, so authors had to choose. Resolving the alias lets
 * both coexist.
 *
 * Only literal unions are inlined. Expanding an object or function alias would
 * replace a name that reads well with a wall of text, and buys nothing: those
 * never produce a control.
 */
function literalUnionAliases(sourceFile: ts.SourceFile): Map<string, string> {
	const aliases = new Map<string, string>();
	ts.forEachChild(sourceFile, (node) => {
		if (!ts.isTypeAliasDeclaration(node)) return;
		if (!ts.isUnionTypeNode(node.type)) return;
		const members = node.type.types;
		if (members.length < 2) return;
		const allLiteral = members.every(
			(m) =>
				ts.isLiteralTypeNode(m) &&
				(ts.isStringLiteral(m.literal) ||
					ts.isNumericLiteral(m.literal) ||
					m.literal.kind === ts.SyntaxKind.NullKeyword),
		);
		if (allLiteral) aliases.set(node.name.text, node.type.getText(sourceFile).trim());
	});
	return aliases;
}

/** A prop's type as documented: the alias resolved when it names a literal
 * union, the written text otherwise. Optional `| undefined` tails and array
 * suffixes are left alone — only a bare alias reference is substituted. */
function resolveTypeText(text: string, aliases: Map<string, string>): string {
	return aliases.get(text.trim()) ?? text;
}


interface InterfaceProp {
	name: string;
	type: string;
	optional: boolean;
	description: string | null;
}

function parseInterfaceProps(
	sourceFile: ts.SourceFile,
	/** The type the component's own `$props()` is annotated with, when it names
	 * one. A component is free to call its props type `ButtonProps`; reading
	 * only `Props` left those props typeless, undescribed, and — because
	 * optionality lives on the interface — wrongly marked required. */
	preferredName?: string | null,
	aliases: Map<string, string> = new Map(),
): InterfaceProp[] {
	const props: InterfaceProp[] = [];
	const wanted = preferredName || 'Props';

	ts.forEachChild(sourceFile, (node) => {
		if (ts.isInterfaceDeclaration(node) && node.name.text === wanted) {
			for (const member of node.members) {
				if (ts.isPropertySignature(member) && member.name) {
					const name = member.name.getText(sourceFile);
					const type = member.type
						? resolveTypeText(member.type.getText(sourceFile), aliases)
						: 'unknown';
					const optional = !!member.questionToken;
					const description = getJsdocComment(member, sourceFile);
					props.push({ name, type, optional, description });
				}
			}
		}
	});

	return props;
}

// ─── JSDoc-typed props (plain JS components) ───

/** Props typed via JSDoc: `@type {{ ... }}` on the $props() declaration, or
 * `@type {Props}` referencing a `@typedef {Object} Props` with `@property` tags. */
function parseJsdocTypeProps(sourceFile: ts.SourceFile): InterfaceProp[] {
	const props: InterfaceProp[] = [];

	function fromTypeLiteral(literal: ts.TypeLiteralNode) {
		for (const member of literal.members) {
			if (ts.isPropertySignature(member) && member.name) {
				props.push({
					name: member.name.getText(sourceFile),
					type: member.type ? member.type.getText(sourceFile) : 'unknown',
					optional: !!member.questionToken,
					description: null,
				});
			}
		}
	}

	function fromTypedef(name: string) {
		function visit(node: ts.Node) {
			// ts.getJSDocTags only surfaces the last JSDoc comment on a node;
			// a standalone @typedef block above the @type one needs the raw list.
			const jsDocs = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc ?? [];
			for (const tag of jsDocs.flatMap((jd) => [...(jd.tags ?? [])])) {
				if (
					ts.isJSDocTypedefTag(tag) &&
					tag.name?.getText(sourceFile) === name &&
					tag.typeExpression &&
					ts.isJSDocTypeLiteral(tag.typeExpression)
				) {
					for (const propTag of tag.typeExpression.jsDocPropertyTags ?? []) {
						const comment = ts.getTextOfJSDocComment(propTag.comment);
						props.push({
							name: propTag.name.getText(sourceFile),
							type: propTag.typeExpression
								? propTag.typeExpression.type.getText(sourceFile)
								: 'unknown',
							optional: propTag.isBracketed,
							description: comment ? reflowJsdocText(comment.replace(/^-\s*/, '')) || null : null,
						});
					}
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
	}

	function visit(node: ts.Node) {
		if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isCallExpression(node.initializer) &&
			node.initializer.expression.getText(sourceFile) === '$props' &&
			ts.isObjectBindingPattern(node.name)
		) {
			// The @type tag sits on the enclosing statement; getJSDocType finds it.
			const typeNode =
				ts.getJSDocType(node) ?? ts.getJSDocType(node.parent?.parent ?? node);
			if (typeNode) {
				if (ts.isTypeLiteralNode(typeNode)) fromTypeLiteral(typeNode);
				else if (ts.isTypeReferenceNode(typeNode)) {
					fromTypedef(typeNode.typeName.getText(sourceFile));
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return props;
}

// ─── $props() destructuring ───

interface DestructuredProp {
	name: string;
	default: string | null;
}

interface DestructuredProps {
	props: DestructuredProp[];
	acceptsClass: boolean;
	forwardsRest: boolean;
	/** A `$props()` call whose result was bound to a plain name rather than
	 * destructured — `let props: Props = $props()`. Legal Svelte that this
	 * reader cannot see into, and the reason extraction can come back empty
	 * from a component with a full props interface. */
	boundWithoutDestructuring: boolean;
	/** The type annotation on the `$props()` declaration — `ButtonProps` in
	 * `let { … }: ButtonProps = $props()`. The component names its own props
	 * type here, so this is the one to read rather than assuming `Props`. */
	typeName: string | null;
}

function parsePropsDestructuring(
	sourceFile: ts.SourceFile,
): DestructuredProps {
	const props: DestructuredProp[] = [];
	let acceptsClass = false;
	let forwardsRest = false;
	let boundWithoutDestructuring = false;
	let typeName: string | null = null;

	function visit(node: ts.Node) {
		const isPropsCall =
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isCallExpression(node.initializer) &&
			node.initializer.expression.getText(sourceFile) === '$props';

		if (isPropsCall && node.type) {
			// `Partial<X>` / `X & Y` aren't a single named interface; take the
			// annotation only when it names one thing this reader can look up.
			const annotation = node.type.getText(sourceFile).trim();
			if (/^[A-Za-z_$][\w$]*$/.test(annotation)) typeName = annotation;
		}
		// A $props() call bound to a plain name: nothing to read here, but the
		// component plainly has props. Noted so the caller can say so rather
		// than report an empty API that looks authoritative.
		if (isPropsCall && node.name && !ts.isObjectBindingPattern(node.name)) {
			boundWithoutDestructuring = true;
		}
		// Match: let { ... } = $props()
		if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isCallExpression(node.initializer) &&
			node.initializer.expression.getText(sourceFile) === '$props' &&
			node.name &&
			ts.isObjectBindingPattern(node.name)
		) {
			for (const element of node.name.elements) {
				if (ts.isBindingElement(element)) {
					// `...rest` is a forwarding declaration, not a prop. Detected
					// syntactically, so it works the same in TS, JS, and JSDoc files.
					if (element.dotDotDotToken) {
						forwardsRest = true;
						continue;
					}
					// Use propertyName when present (e.g. `class: className`)
					const name = element.propertyName
						? element.propertyName.getText(sourceFile)
						: element.name.getText(sourceFile);
					// `class` (always aliased — it's a reserved word) is a forwarded
					// attribute, not an own prop; surfaced as a chip, not a row.
					if (name === 'class') {
						acceptsClass = true;
						continue;
					}
					const rawDefault = element.initializer
						? element.initializer.getText(sourceFile)
						: null;
					// Strip wrapping quotes from string literals
					const defaultValue = rawDefault?.match(/^['"`](.*?)['"`]$/)
						? rawDefault.slice(1, -1) || null
						: rawDefault;
					props.push({ name, default: defaultValue });
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return { props, acceptsClass, forwardsRest, boundWithoutDestructuring, typeName };
}

/** The heritage type `interface Props` extends, when present — e.g.
 * `HTMLButtonAttributes` or `HTMLAttributes<HTMLDivElement>`. Labels what a
 * `...rest` spread forwards; JS/JSDoc components have no heritage (null). */
function parsePropsHeritage(
	sourceFile: ts.SourceFile,
	preferredName?: string | null,
): string | null {
	let heritage: string | null = null;
	const wanted = preferredName || 'Props';

	ts.forEachChild(sourceFile, (node) => {
		if (ts.isInterfaceDeclaration(node) && node.name.text === wanted) {
			const clause = node.heritageClauses?.find(
				(c) => c.token === ts.SyntaxKind.ExtendsKeyword,
			);
			const first = clause?.types[0];
			if (first) heritage = first.getText(sourceFile);
		}
	});

	return heritage;
}

// ─── JSDoc parsing ───

interface JsdocPropData {
	name: string;
	description: string | null;
	type: string | null;
}

function parseJsdocComments(sourceFile: ts.SourceFile): JsdocPropData[] {
	// JSDoc data is already captured from interface Props via getJsdocComment
	// This handles per-prop JSDoc in destructuring (JS components)
	const data: JsdocPropData[] = [];

	function visit(node: ts.Node) {
		if (
			ts.isVariableDeclaration(node) &&
			node.name &&
			ts.isObjectBindingPattern(node.name)
		) {
			for (const element of node.name.elements) {
				if (ts.isBindingElement(element)) {
					const desc = getJsdocComment(element, sourceFile);
					if (desc) {
						data.push({
							name: element.name.getText(sourceFile),
							description: desc,
							type: null,
						});
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return data;
}

// ─── Merge props from all sources ───

function mergeProps(
	interfaceProps: InterfaceProp[],
	destructuredProps: DestructuredProp[],
	jsdocData: JsdocPropData[],
	/** The component declares a typed Props shape (interface or JSDoc). */
	typed = false,
): ParsedProp[] {
	const propMap = new Map<string, ParsedProp>();

	// Start with interface props
	for (const ip of interfaceProps) {
		propMap.set(ip.name, {
			name: ip.name,
			type: ip.type,
			default: null,
			description: ip.description,
			required: !ip.optional,
			category: classifyProp(ip.name, ip.type),
		});
	}

	// Merge destructured defaults
	for (const dp of destructuredProps) {
		const existing = propMap.get(dp.name);
		if (existing) {
			existing.default = dp.default;
			if (dp.default !== null) existing.required = false;
		} else {
			// Destructured but not declared: an attribute inherited through the
			// Props heritage (`extends HTMLAttributes<…>`) — explicitly pulled
			// out of `...rest` — or an undeclared extra. Either way its
			// requiredness isn't ours to assert, so only an *untyped* component
			// falls back to "no default means required".
			propMap.set(dp.name, {
				name: dp.name,
				type: null,
				default: dp.default,
				description: null,
				required: !typed && dp.default === null,
				category: 'prop',
			});
		}
	}

	// Merge JSDoc descriptions
	for (const jd of jsdocData) {
		const existing = propMap.get(jd.name);
		if (existing && !existing.description && jd.description) {
			existing.description = jd.description;
		}
		if (existing && !existing.type && jd.type) {
			existing.type = jd.type;
		}
	}

	return Array.from(propMap.values());
}

// ─── Classify prop ───

function classifyProp(
	name: string,
	type: string | null,
): 'prop' | 'event' | 'snippet' {
	if (name.startsWith('on') && type?.includes('=>')) return 'event';
	// Matches `Snippet`, `Snippet<[...]>`, and `import('svelte').Snippet`
	if (type && /(^|\.)Snippet\b/.test(type)) return 'snippet';
	return 'prop';
}

// ─── Exported functions ───

function parseExportedFunctions(sourceFile: ts.SourceFile): ParsedMethod[] {
	const methods: ParsedMethod[] = [];

	ts.forEachChild(sourceFile, (node) => {
		if (
			ts.isFunctionDeclaration(node) &&
			node.name &&
			hasExportModifier(node)
		) {
			const params = node.parameters
				.map((p) => p.getText(sourceFile))
				.join(', ');
			const returnType = node.type
				? node.type.getText(sourceFile)
				: null;
			const description = getJsdocComment(node, sourceFile);
			methods.push({
				name: node.name.text,
				params,
				returnType,
				description,
			});
		}
	});

	return methods;
}

// ─── Exported state ───

function parseExportedState(sourceFile: ts.SourceFile): ParsedState[] {
	const state: ParsedState[] = [];

	ts.forEachChild(sourceFile, (node) => {
		if (
			ts.isVariableStatement(node) &&
			hasExportModifier(node)
		) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					const init = decl.initializer?.getText(sourceFile) ?? '';
					if (
						init.includes('$state') ||
						init.includes('$derived')
					) {
						const description = getJsdocComment(node, sourceFile);
						state.push({
							name: decl.name.text,
							type: decl.type
								? decl.type.getText(sourceFile)
								: null,
							description,
						});
					}
				}
			}
		}
	});

	return state;
}

// ─── CSS custom properties ───

function parseCssProps(
	fullSource: string,
	styleContent: string,
): ParsedCssProp[] {
	// Scrub comments so commented-out declarations/usages never count.
	const style = styleContent.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

	// A `--x: value` declaration IS the default, stated once — the strongest
	// signal, taken over any var() fallback.
	const declared = new Map<string, string>();
	const declRegex = /(^|[{;])\s*(--[\w-]+)\s*:\s*([^;}]+)/g;
	let match;
	while ((match = declRegex.exec(style)) !== null) {
		if (!declared.has(match[2])) declared.set(match[2], match[3].trim());
	}

	// Collect EVERY var(--name, fallback) use with the property it feeds —
	// used to fill in a documented prop's default, NOT to decide which props
	// are public. Divergent fallbacks across properties surface as "Mixed"
	// with the per-property breakdown, instead of silently picking the first.
	// Supports one level of nested parens: var(--x, var(--y)), var(--x, rgba(0,0,0,0.5))
	// The default alternation uses a single-char branch (not [^()]+) so the two
	// branches can't overlap under the outer + — no catastrophic backtracking.
	const uses = new Map<string, { property: string; value: string }[]>();
	const varRegex = /var\(\s*(--[\w-]+)(?:\s*,\s*((?:[^()]|\([^()]*\))+))?\s*\)/g;
	while ((match = varRegex.exec(style)) !== null) {
		const name = match[1];
		const value = match[2]?.trim();
		if (!value) continue;
		const before = style.slice(0, match.index);
		const property = before.match(/([-\w]+)\s*:[^;{}]*$/)?.[1] ?? '?';
		const list = uses.get(name) ?? [];
		list.push({ property, value });
		uses.set(name, list);
	}

	// Only @cssvar-annotated custom properties form the documented CSS API.
	// Vars used purely for internal wiring (never annotated) are intentionally
	// left out — the table shows what a consumer is meant to override, not
	// every var the component happens to reference.
	const propMap = new Map<string, ParsedCssProp>();
	const cssvarRegex =
		/@cssvar\s+\{(\w+)\}\s+(--[\w-]+)\s*-?\s*(.*?)(?:\(default:\s*([^)]+)\))?$/gm;
	while ((match = cssvarRegex.exec(fullSource)) !== null) {
		const type = match[1];
		const name = match[2];
		const description = match[3]?.trim() || null;
		const annotatedDefault = match[4]?.trim() ?? null;
		// Default resolution: a `--x: value` declaration wins; else the var()
		// fallback when all uses agree; else "Mixed" (default null + the
		// per-property breakdown); the annotation's (default: …) is the
		// backstop when the style declares nothing.
		const varUses = uses.get(name) ?? [];
		const distinct = [...new Set(varUses.map((u) => u.value))];
		const decl = declared.get(name);
		propMap.set(name, {
			name,
			type,
			default: decl ?? (distinct.length === 1 ? distinct[0] : distinct.length === 0 ? annotatedDefault : null),
			defaultUses: !decl && distinct.length > 1 ? varUses : undefined,
			description,
		});
	}

	return Array.from(propMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Helpers ───

/** Reflow JSDoc description text: hard-wrapped lines rejoin into their
 * sentence, while blank lines and list markers (`-`, `*`, `1.`) keep a real
 * line break — so a multi-line description reads as written, not as wrapped. */
export function reflowJsdocText(text: string): string {
	const lines = text.split('\n').map((l) => l.trim());
	let out = '';
	for (const line of lines) {
		if (!out) {
			out = line;
			continue;
		}
		if (line === '') {
			// Paragraph break (collapse runs of blank lines to one break)
			if (!out.endsWith('\n')) out += '\n';
			continue;
		}
		if (/^([-*•]|\d+[.)])\s/.test(line)) {
			out += (out.endsWith('\n') ? '' : '\n') + line;
			continue;
		}
		out += (out.endsWith('\n') ? '' : ' ') + line;
	}
	return out.trim();
}

function getJsdocComment(
	node: ts.Node,
	sourceFile: ts.SourceFile,
): string | null {
	const fullText = sourceFile.getFullText();
	const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
	if (!ranges) return null;

	for (const range of ranges) {
		const comment = fullText.slice(range.pos, range.end);
		if (comment.startsWith('/**')) {
			// Extract text between /** and */
			const text = comment
				.replace(/^\/\*\*\s*/, '')
				.replace(/\s*\*\/$/, '')
				.replace(/^\s*\*\s?/gm, '')
				.trim();
			// The description is everything up to the first @tag line — the
			// whole text, not just its first line.
			const descLines: string[] = [];
			for (const line of text.split('\n')) {
				if (line.trim().startsWith('@')) break;
				descLines.push(line);
			}
			const desc = reflowJsdocText(descLines.join('\n'));
			if (desc) return desc;
		}
	}

	return null;
}

function hasExportModifier(node: ts.Node): boolean {
	const modifiers = ts.canHaveModifiers(node)
		? ts.getModifiers(node)
		: undefined;
	return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
