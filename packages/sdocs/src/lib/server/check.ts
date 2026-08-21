import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseSdoc, normalizeBody } from '../language/parser.js';
import { offsetToPosition } from '../language/scanner.js';
import {
	generateIframeComponent,
	generatePageComponent,
	resolveScriptImports,
	scanRelativeImports,
	sdocsWarningFilter,
} from './snippet-compiler.js';
import { renderPageMarkdown } from './page-markdown.js';
import { loadSvelteCompiler } from './svelte-toolchain.js';
import { extractImports, resolveComponentImport } from './doc-model.js';

/**
 * Compile every documentation stage the way the dev server does.
 *
 * `parseSdoc` validates the sdoc grammar; it can't see a Svelte syntax error
 * inside an example, an import that points nowhere, or a stage that throws at
 * compile time — those surface only when the route is opened. This runs the
 * real generators (`generateIframeComponent` / `generatePageComponent`) over
 * every preview, example, page, and layout body and compiles the result with
 * the Svelte compiler, so a broken stage is caught before anyone opens it.
 *
 * What it does NOT catch: type errors (the compiler doesn't type-check) and
 * anything that only fails at runtime.
 */

export interface CheckProblem {
	/** Project-relative .sdoc path */
	file: string;
	/** Entity title the stage belongs to */
	entity?: string;
	/** Which stage: a preview label, an example title, or the body */
	stage?: string;
	/** 'grammar' (parser), 'compile' (Svelte), 'import' (unresolved path), or
	 * 'component' (a `component={…}` that traces to no component file) */
	kind: 'grammar' | 'compile' | 'import' | 'component';
	severity: 'error' | 'warning';
	message: string;
	/** 1-based line in the .sdoc file, when it maps back confidently */
	line?: number;
	/** Diagnostic code, when the source provides one */
	code?: string;
}

export interface CheckResult {
	ok: boolean;
	checked: { files: number; stages: number };
	problems: CheckProblem[];
}

/** Line (0-based) of an offset within a string. */
function lineOf(text: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text[i] === '\n') line++;
	}
	return line;
}

/**
 * The .sdoc line the embedded markup starts on.
 *
 * Found by content rather than by offset arithmetic: `normalizeBody` strips a
 * common indent, so the embedded text and the source line differ in leading
 * whitespace but not in what they say. Searching within the block's own span
 * keeps a line that happens to repeat elsewhere in the file out of it.
 */
function sdocMarkupLine(
	source: string,
	firstLine: string,
	bodyStart: number,
	bodyEnd: number,
): number | undefined {
	const needle = firstLine.trim();
	if (!needle) return undefined;
	const lines = source.slice(0, bodyEnd).split('\n');
	const from = lineOf(source, bodyStart);
	for (let i = from; i < lines.length; i++) {
		if (lines[i].trim() === needle) return i;
	}
	return undefined;
}

/**
 * Map a line in generated component source back to the .sdoc.
 *
 * The generator embeds the block body verbatim, and `normalizeBody` only
 * strips a common indent — it never adds or removes lines — so the offset
 * between the two is constant. Returns undefined unless the mapped line lands
 * inside the block, so a bad guess is reported as "no line" rather than a
 * line pointing somewhere unrelated.
 */
function mapLine(
	generated: string,
	embedded: string,
	generatedLine: number,
	source: string,
	bodyStart: number,
	bodyEnd: number,
): number | undefined {
	const firstLine = embedded.split('\n').find((l) => l.trim() !== '');
	if (!firstLine || !embedded.trim()) return undefined;
	const at = generated.indexOf(firstLine);
	if (at === -1) return undefined;
	const genBodyLine = lineOf(generated, at);
	// Anchor on where the MARKUP starts in the .sdoc, not where the body does.
	// A block with its own <script> has that script lifted out before the
	// markup is embedded, so anchoring on the body put every line off by the
	// length of the script — a stage with a five-line <script> reported line 9
	// for a mistake on line 14.
	const sdocBodyLine = sdocMarkupLine(source, firstLine, bodyStart, bodyEnd);
	if (sdocBodyLine === undefined) return undefined;
	const mapped = generatedLine - genBodyLine + sdocBodyLine;
	const lastLine = lineOf(source, bodyEnd);
	if (mapped < sdocBodyLine || mapped > lastLine) return undefined;
	return mapped + 1;
}

/** Relative imports that resolve to nothing on disk. Bare specifiers (npm
 * packages) are left alone — resolving those needs the project's own module
 * resolution, and a false "missing package" is worse than silence. */
function missingImports(script: string, docFilePath: string): string[] {
	const missing: string[] = [];
	const dir = dirname(docFilePath);
	// Same scanner the rewriter uses, so the two can never disagree about
	// what counts as an import.
	for (const { spec } of scanRelativeImports(script)) {
		// A Vite query or hash (`?raw`, `?url#frag`) isn't part of the path.
		const base = resolve(dir, spec.replace(/[?#].*$/, ''));
		const candidates = [
			base,
			`${base}.svelte`,
			`${base}.ts`,
			`${base}.js`,
			`${base}/index.ts`,
			`${base}/index.js`,
			`${base}/index.svelte`,
			// A '.js' specifier commonly points at a '.ts' source.
			base.replace(/\.js$/, '.ts'),
		];
		if (!candidates.some((c) => existsSync(c))) missing.push(spec);
	}
	return missing;
}

/**
 * Compile one generated component, collecting errors and warnings. The compiler is
 * passed in rather than imported: it must be the PROJECT's, the same one that will
 * compile these components for real (see svelte-toolchain.ts).
 */
function compileStage(
	compile: typeof import('svelte/compiler').compile,
	generated: string,
	filename: string,
	locate: (line: number) => number | undefined,
	keep: (p: { code?: string }) => boolean = () => true,
): { problems: Omit<CheckProblem, 'file' | 'entity' | 'stage'>[] } {
	const all: Omit<CheckProblem, 'file' | 'entity' | 'stage'>[] = [];
	try {
		const { warnings } = compile(generated, {
			filename,
			generate: 'client',
			warningFilter: sdocsWarningFilter,
		});
		for (const w of warnings) {
			all.push({
				kind: 'compile',
				severity: 'warning',
				message: w.message,
				code: w.code,
				line: w.start ? locate(w.start.line - 1) : undefined,
			});
		}
	} catch (err) {
		const e = err as { message?: string; code?: string; start?: { line: number } };
		all.push({
			kind: 'compile',
			severity: 'error',
			message: e.message ?? String(err),
			code: e.code,
			line: e.start ? locate(e.start.line - 1) : undefined,
		});
	}
	return { problems: all.filter(keep) };
}

/** Check one `.sdoc` file: grammar, imports, and every stage's compilation. */
export async function checkDocFile(filePath: string, cwd: string): Promise<CheckResult> {
	const { compile } = await loadSvelteCompiler(cwd);
	const file = relative(cwd, filePath) || filePath;
	const problems: CheckProblem[] = [];
	let stages = 0;

	const source = await readFile(filePath, 'utf-8');
	const doc = parseSdoc(source);

	for (const d of doc.diagnostics) {
		problems.push({
			file,
			kind: 'grammar',
			severity: 'error',
			message: d.message,
			code: d.code,
			line: offsetToPosition(source, d.span.start).line + 1,
		});
	}

	const fileScript = doc.script?.content ?? '';
	const filePrelude = resolveScriptImports(fileScript, filePath);
	const fileStyle = doc.style?.content ?? '';

	for (const spec of missingImports(fileScript, filePath)) {
		problems.push({
			file,
			kind: 'import',
			severity: 'error',
			message: `Import "${spec}" resolves to no file on disk.`,
			line: doc.script ? offsetToPosition(source, doc.script.span.start).line + 1 : undefined,
		});
	}

	for (const entity of doc.entities) {
		const entityScript = entity.script?.content ?? '';
		const entityPrelude = entityScript ? resolveScriptImports(entityScript, filePath) : '';
		const scriptPrelude = [filePrelude, entityPrelude].filter((s) => s.trim()).join('\n');
		const entityStyle = entity.style?.content ?? '';

		for (const spec of missingImports(entityScript, filePath)) {
			problems.push({
				file,
				entity: entity.title,
				kind: 'import',
				severity: 'error',
				message: `Import "${spec}" resolves to no file on disk.`,
				line: entity.script
					? offsetToPosition(source, entity.script.span.start).line + 1
					: undefined,
			});
		}

		/** One stage: generate it exactly as the dev server would, then compile. */
		const checkStage = (
			stageName: string,
			markup: string,
			bodySpan: { start: number; end: number },
			blockScript: string | null,
			blockStyle: string | null,
			asPage: boolean,
		) => {
			stages++;
			if (blockScript) {
				for (const spec of missingImports(blockScript, filePath)) {
					problems.push({
						file,
						entity: entity.title,
						stage: stageName,
						kind: 'import',
						severity: 'error',
						message: `Import "${spec}" resolves to no file on disk.`,
						line: offsetToPosition(source, bodySpan.start).line + 1,
					});
				}
			}
			const styles = [fileStyle, entityStyle, blockStyle]
				.filter((s): s is string => !!s?.trim())
				.join('\n\n');
			const generated = asPage
				? generatePageComponent(scriptPrelude, markup, styles || undefined)
				: generateIframeComponent(scriptPrelude, markup, [], undefined, undefined, {
						blockScript: blockScript ? resolveScriptImports(blockScript, filePath) : undefined,
						styles: styles || undefined,
					});
			const locate = (line: number) =>
				mapLine(generated, markup, line, source, bodySpan.start, bodySpan.end);
			const { problems: stageProblems } = compileStage(
				compile,
				generated,
				`/@sdocs/check/${entity.slug}.svelte`,
				locate,
			);
			for (const p of stageProblems) {
				problems.push({ file, entity: entity.title, stage: stageName, ...p });
			}
		};

		if (entity.kind === 'SHOWCASE') {
			// `component={X}` must trace to a real component file: without it the
			// preview still renders, but its API tables and controls silently
			// don't. The build only warns; here it's an error you can gate on.
			const fileImports = extractImports(fileScript);
			const entityImports = extractImports(entityScript);
			for (const p of entity.previews) {
				if (!p.componentName) continue;
				const blockImports = p.script ? extractImports(p.script.content) : [];
				const resolvedComponent = resolveComponentImport(
					p.componentName,
					[...blockImports, ...entityImports, ...fileImports],
					filePath,
				);
				if (!resolvedComponent || !existsSync(resolvedComponent)) {
					problems.push({
						file,
						entity: entity.title,
						stage: p.label,
						kind: 'component',
						severity: 'error',
						message:
							`component={${p.componentName}} doesn't resolve to a component file — ` +
							"check the import in the file's, the entity's, or the block's <script>.",
						line: offsetToPosition(source, p.span.start).line + 1,
					});
				}
			}
			for (const p of entity.previews) {
				checkStage(p.label, p.markup, p.bodySpan, p.script?.content ?? null, p.style?.content ?? null, false);
			}
			for (const ex of entity.examples) {
				checkStage(ex.title, ex.markup, ex.bodySpan, ex.script?.content ?? null, ex.style?.content ?? null, false);
			}
		} else if (entity.kind === 'DOC') {
			// The prose body compiles as a page component after markdown
			// rendering — the same shape the Explorer serves.
			stages++;
			const rendered = await renderPageMarkdown(normalizeBody(entity.body));
			const generated = generatePageComponent(
				scriptPrelude,
				rendered.html,
				[fileStyle, entityStyle].filter((s) => s.trim()).join('\n\n') || undefined,
			);
			// A page-module filename, so the shared warning filter treats this
			// exactly as the dev server and the build do.
			const { problems: bodyProblems } = compileStage(
				compile,
				generated,
				`/@sdocs/page/${entity.slug}.svelte`,
				() => undefined,
			);
			for (const p of bodyProblems) {
				problems.push({ file, entity: entity.title, stage: 'body', ...p });
			}
			for (const ex of entity.examples) {
				checkStage(ex.title, ex.markup, ex.bodySpan, ex.script?.content ?? null, ex.style?.content ?? null, false);
			}
		} else {
			// PAGE renders in the docs context; LAYOUT on an isolated stage.
			const body = normalizeBody(entity.body);
			checkStage('body', body, entity.bodySpan, null, null, entity.kind === 'PAGE');
		}
	}

	return {
		ok: problems.every((p) => p.severity !== 'error'),
		checked: { files: 1, stages },
		problems,
	};
}

/** Check many `.sdoc` files, merging the results. */
export async function checkDocFiles(files: string[], cwd: string): Promise<CheckResult> {
	const problems: CheckProblem[] = [];
	let stages = 0;
	for (const file of files) {
		const result = await checkDocFile(file, cwd);
		problems.push(...result.problems);
		stages += result.checked.stages;
	}
	return {
		ok: problems.every((p) => p.severity !== 'error'),
		checked: { files: files.length, stages },
		problems,
	};
}

/**
 * One problem, the way `sdocs check` prints it: where it is, then the message
 * indented under it — compile messages are often several lines, because they
 * carry the compiler's own frame.
 */
export function formatProblem(p: CheckProblem): string {
	const where = [p.file + (p.line ? `:${p.line}` : ''), p.entity, p.stage].filter(Boolean).join(' › ');
	const label = p.severity === 'error' ? 'error' : 'warning';
	return [`${label}  ${where}`, ...p.message.split('\n').map((l) => `  ${l}`)].join('\n');
}
