/**
 * Shared entity → snippet planning. Both the Vite plugin (URL generation)
 * and the CLI app-gen (pre-computed rollup inputs) derive snippet slugs
 * from this module, so build inputs always byte-match plugin output.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import type { SdocEntity } from '../language/index.js';
import type { DocNote } from '../types.js';
import { exampleSlug, previewSlug } from '../language/parser.js';
import { scrubScriptText } from '../language/script-scan.js';

export type SnippetRole = 'preview' | 'example' | 'content';

export interface PlannedSnippet {
	name: string;
	slug: string;
	role: SnippetRole;
	/** Full body — block script/style included (display/formatting form) */
	body: string;
	/** Markup between the block script and style (the runtime fragment) */
	markup: string;
	/** Block-level <script> content, when the block declares one */
	script: string | null;
	/** Block-level <style> content, when the block declares one */
	style: string | null;
	/** Short text rendered with the block, when present */
	description: string | null;
	/** An example's tags="…" — what it shows. Absent on other roles. */
	tags?: string[];
	/** An example's notes={[…]}. Absent on other roles. */
	notes?: DocNote[];
	/** False when the example says `code="false"`. Absent on other roles. */
	showCode?: boolean;
	/** A preview's synonyms="…" — the component's other names. Absent on
	 * other roles. */
	synonyms?: string[];
	/** For a [component] preview: the component reference it demonstrates */
	componentName?: string | null;
}

// Slug derivation lives with the parser (it diagnoses collisions at parse
// time); re-exported here so snippet consumers keep one import site.
export { exampleSlug, previewSlug };

/** The snippets one entity produces, in order: previews then examples for
 * SHOWCASE, the 'content' body then examples for DOC, the single 'content'
 * body for PAGE and LAYOUT. DOC and PAGE content renders natively in the
 * Explorer — never served as an iframe page (see planIframeSnippets). */
export function planEntitySnippets(entity: SdocEntity): PlannedSnippet[] {
	const blockParts = (b: {
		body: string;
		markup: string;
		script: { content: string } | null;
		style: { content: string } | null;
		description?: string | null;
	}) => ({
		body: b.body,
		markup: b.markup,
		script: b.script?.content ?? null,
		style: b.style?.content ?? null,
		description: b.description ?? null,
	});
	// Slugs must be unique within the entity: they address iframe URLs and
	// emitted chunk fileNames. Preview slugs stay untouched (URL stability);
	// an example whose slug collides — with a preview ("X Ray" → x-ray vs
	// example "Ray" → x-ray) or an earlier example — gets a deterministic
	// numeric suffix. The parser warns about the collision separately.
	const usedSlugs = new Set<string>();
	const example = (e: ExampleLike) => {
		let slug = exampleSlug(e.title);
		if (usedSlugs.has(slug)) {
			let n = 2;
			while (usedSlugs.has(`${slug}-${n}`)) n++;
			slug = `${slug}-${n}`;
		}
		usedSlugs.add(slug);
		return {
			name: e.title,
			slug,
			role: 'example' as const,
			tags: e.tags ?? [],
			notes: e.notes ?? [],
			showCode: e.showCode ?? true,
			...blockParts(e),
		};
	};
	if (entity.kind === 'SHOWCASE') {
		const previews = entity.previews.map((p) => {
			const slug = previewSlug(p.label);
			usedSlugs.add(slug);
			return {
				name: p.label,
				slug,
				role: 'preview' as const,
				componentName: p.componentName ?? null,
				synonyms: p.synonyms ?? [],
				...blockParts(p),
			};
		});
		return [...previews, ...entity.examples.map(example)];
	}
	const content = {
		name: 'Content',
		slug: 'content',
		role: 'content' as const,
		body: entity.body,
		markup: entity.body,
		script: null,
		style: null,
		description: null,
	};
	usedSlugs.add(content.slug);
	if (entity.kind === 'DOC') {
		return [content, ...entity.examples.map(example)];
	}
	return [content];
}

interface ExampleLike {
	title: string;
	tags?: string[];
	notes?: DocNote[];
	showCode?: boolean;
	body: string;
	markup: string;
	script: { content: string } | null;
	style: { content: string } | null;
	description?: string | null;
}

/** The snippets of an entity that are served as iframe preview pages:
 * everything except DOC and PAGE content, which render natively in the
 * docs context (a DOC's body also references the Explorer-provided
 * `__sdocsExample` snippet and only compiles there). */
export function planIframeSnippets(entity: SdocEntity): PlannedSnippet[] {
	return planEntitySnippets(entity).filter(
		(s) => !((entity.kind === 'DOC' || entity.kind === 'PAGE') && s.role === 'content'),
	);
}

/** Extract import statements from the file-level script content. Matches on
 * the scrubbed text (comments and string/template contents blanked) so an
 * import-shaped line inside a code sample never counts, then reads the real
 * statement back from the original at the same offsets. */
export function extractImports(scriptContent: string): string[] {
	const scrubbed = scrubScriptText(scriptContent);
	const imports: string[] = [];
	const regex = /^[ \t]*import\s+.+$/gm;
	let match;
	while ((match = regex.exec(scrubbed)) !== null) {
		imports.push(scriptContent.slice(match.index, match.index + match[0].length).trim());
	}
	return imports;
}

/** Resolve a default-imported identifier to the raw path it imports from
 * (relative to `fromPath`). Returns null when the identifier isn't imported. */
/** Where an identifier's import points, and which binding it names there:
 * `null` for a default import (`import X from …`), the source name for a
 * named one (`import { X } from …`, `import { Y as X } from …`). */
interface ImportTarget {
	path: string;
	/** The binding to follow inside that module; null → its default export. */
	binding: string | null;
}

function importedPath(name: string, imports: string[], fromPath: string): ImportTarget | null {
	for (const imp of imports) {
		const def = imp.match(new RegExp(`import\\s+${name}\\s+from\\s+['"](.+?)['"]`));
		if (def) return { path: resolve(dirname(fromPath), def[1]), binding: null };
		// A named import — optionally aliased — inside the braces.
		const named = imp.match(
			new RegExp(
				`import\\s*\\{[^}]*?\\b(?:([A-Za-z_$][\\w$]*)\\s+as\\s+)?${name}\\b[^}]*\\}\\s*from\\s*['"](.+?)['"]`,
			),
		);
		if (named) {
			return {
				path: resolve(dirname(fromPath), named[2]),
				binding: named[1] ?? name,
			};
		}
	}
	return null;
}

/** Read a module referenced by an import specifier, trying the extensions ESM
 * lets you omit or rewrite (`./index.js` often *is* `index.ts`). Returns the
 * source and the real path, or null. */
function readModule(path: string): { source: string; path: string } | null {
	const candidates = [
		path,
		path.replace(/\.m?js$/, (m) => (m === '.mjs' ? '.mts' : '.ts')),
		`${path}.ts`,
		`${path}.js`,
		`${path}/index.ts`,
		`${path}/index.js`,
	];
	for (const p of candidates) {
		try {
			return { source: readFileSync(p, 'utf8'), path: p };
		} catch {
			/* try the next candidate */
		}
	}
	return null;
}

/** Parse a JS/TS module once, for binding lookups. */
function parseModule(source: string, path: string): ts.SourceFile {
	return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** The identifier a compound initializer points at:
 * `Object.assign(Base, …)` → `Base`, a bare `Base` → `Base`. */
function initializerTarget(expr: ts.Expression): string | null {
	if (ts.isIdentifier(expr)) return expr.text;
	if (
		ts.isCallExpression(expr) &&
		ts.isPropertyAccessExpression(expr.expression) &&
		ts.isIdentifier(expr.expression.expression) &&
		expr.expression.expression.text === 'Object' &&
		expr.expression.name.text === 'assign' &&
		expr.arguments.length > 0
	) {
		const first = expr.arguments[0];
		return ts.isIdentifier(first) ? first.text : null;
	}
	return null;
}

/** What a module exports as `default`: the identifier it ultimately names. */
function defaultExportTarget(file: ts.SourceFile): string | null {
	for (const stmt of file.statements) {
		if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
			return initializerTarget(stmt.expression);
		}
		// `export { X as default }`
		if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
			for (const el of stmt.exportClause.elements) {
				if (el.name.text === 'default') return (el.propertyName ?? el.name).text;
			}
		}
	}
	return null;
}

/**
 * Trace a binding inside a JS/TS module to the `.svelte` file it refers to.
 *
 * Reads the real TypeScript AST rather than matching source text: a compound
 * root is commonly annotated —
 * `const X: typeof Root & { Y: typeof Y } = Object.assign(Root, { Y })` —
 * and any pattern-matching over the raw text has to anticipate every shape the
 * annotation can take. The AST just tells us.
 */
function resolveInModule(
	name: string,
	source: string,
	modulePath: string,
	depth: number,
): string | null {
	if (depth <= 0) return null;
	const file = parseModule(source, modulePath);
	const dir = dirname(modulePath);

	for (const stmt of file.statements) {
		// `import X from '…'` / `import { Y as X } from '…'`
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const clause = stmt.importClause;
			if (!clause) continue;
			const from = resolve(dir, stmt.moduleSpecifier.text);
			if (clause.name?.text === name) return followToSvelte(from, null, depth - 1);
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const el of clause.namedBindings.elements) {
					if (el.name.text !== name) continue;
					const sourceName = (el.propertyName ?? el.name).text;
					return followToSvelte(from, sourceName === 'default' ? null : sourceName, depth - 1);
				}
			}
			continue;
		}

		// `export { default as X } from '…'` — the barrel idiom, where the
		// binding never exists locally.
		if (
			ts.isExportDeclaration(stmt) &&
			stmt.exportClause &&
			ts.isNamedExports(stmt.exportClause) &&
			stmt.moduleSpecifier &&
			ts.isStringLiteral(stmt.moduleSpecifier)
		) {
			const from = resolve(dir, stmt.moduleSpecifier.text);
			for (const el of stmt.exportClause.elements) {
				if (el.name.text !== name) continue;
				const sourceName = (el.propertyName ?? el.name).text;
				return followToSvelte(from, sourceName === 'default' ? null : sourceName, depth - 1);
			}
			continue;
		}

		// `const X[: SomeType] = Object.assign(Base, …)` or `= Base`. The type
		// annotation is just another node here — nothing to pattern-match past.
		if (ts.isVariableStatement(stmt)) {
			for (const decl of stmt.declarationList.declarations) {
				if (!ts.isIdentifier(decl.name) || decl.name.text !== name || !decl.initializer) continue;
				const target = initializerTarget(decl.initializer);
				if (target && target !== name) {
					return resolveInModule(target, source, modulePath, depth - 1);
				}
			}
		}
	}
	return null;
}

/** Follow a resolved import target: a `.svelte` file is the answer; a JS/TS
 * module is followed through its `export default` (bare identifier) or its
 * binding for `member` (member access). */
function followToSvelte(path: string, member: string | null, depth: number): string | null {
	if (depth <= 0) return null;
	if (path.endsWith('.svelte')) return member ? null : path;
	const mod = readModule(path);
	if (!mod) return path.endsWith('.svelte') ? path : null;
	if (member) return resolveInModule(member, mod.source, mod.path, depth);
	const def = defaultExportTarget(parseModule(mod.source, mod.path));
	return def ? resolveInModule(def, mod.source, mod.path, depth) : null;
}

/** Resolve a `component={…}` reference to an absolute `.svelte` path via the
 * file's imports. Handles a bare identifier (`Button`), a compound default
 * exported from an index module (`NavTree` → index.ts → the root component),
 * and member access into that module (`NavTree.Group` → Group.svelte).
 * Returns null when it can't be traced to a component. */
export function resolveComponentImport(
	componentName: string,
	imports: string[],
	docFilePath: string,
): string | null {
	const dot = componentName.indexOf('.');
	const base = dot === -1 ? componentName : componentName.slice(0, dot);
	const member = dot === -1 ? null : componentName.slice(dot + 1);
	const target = importedPath(base, imports, docFilePath);
	if (!target) return null;
	// `Tree.Item` resolves the member inside the module either way; a bare
	// identifier follows the default export, or the binding a named import
	// asked for (`import { Tree } from './index.js'`).
	return followToSvelte(target.path, member ?? target.binding, 8);
}
