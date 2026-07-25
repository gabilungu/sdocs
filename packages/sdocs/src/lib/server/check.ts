import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { compile } from 'svelte/compiler';
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
	/** 'grammar' (parser), 'compile' (Svelte), or 'import' (unresolved path) */
	kind: 'grammar' | 'compile' | 'import';
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
	const at = generated.indexOf(embedded.split('\n')[0]);
	if (at === -1 || !embedded.trim()) return undefined;
	const genBodyLine = lineOf(generated, at);
	const sdocBodyLine = lineOf(source, bodyStart);
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

/** Compile one generated component, collecting errors and warnings. */
function compileStage(
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
				generated,
				`/@sdocs/check/${entity.slug}.svelte`,
				locate,
			);
			for (const p of stageProblems) {
				problems.push({ file, entity: entity.title, stage: stageName, ...p });
			}
		};

		if (entity.kind === 'SHOWCASE') {
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
			const { problems: bodyProblems } = compileStage(
				generated,
				`/@sdocs/check/${entity.slug}.svelte`,
				() => undefined,
				// Prose markup is rendered by sdocs' own markdown pipeline, and
				// shiki emits `<pre tabindex="0">` (the a11y-correct thing for a
				// scrollable code block). Svelte's rule flags it, but the author
				// can't act on markup they didn't write — don't report it.
				(p) => p.code !== 'a11y_no_noninteractive_tabindex',
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
