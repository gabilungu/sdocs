import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { glob } from 'tinyglobby';
import { parseSdoc } from '../language/parser.js';
import { extractImports, resolveComponentImport } from './doc-model.js';

/**
 * Documentation coverage: which components under the configured globs have a
 * `[component]` preview, and which don't.
 *
 * "Documented" means some `[component]` block resolves to that file through
 * the real resolver — the same one the Explorer uses — so a compound family
 * counts correctly: `component={NavTree}` and `component={NavTree.Item}`
 * resolve to different `.svelte` files, and each is measured on its own.
 */

/** Where a component is documented. */
export interface CoverageSite {
	/** Project-relative .sdoc path */
	file: string;
	/** Entity title */
	entity: string;
	/** Preview tab label */
	stage: string;
	/** The `component={…}` identifier as written */
	component: string;
}

export interface CoverageResult {
	/** The globs coverage was measured against (project-relative). */
	componentGlobs: string[];
	counts: {
		components: number;
		documented: number;
		undocumented: number;
	};
	/** Component files with no `[component]` pointing at them. */
	undocumented: string[];
	/** Component files with at least one preview, and where. */
	documented: { component: string; sites: CoverageSite[] }[];
	/** Documented from more than one `.sdoc` file — usually a mistake. Several
	 * previews of one component *within* one file is a supported pattern
	 * (tabs), so that alone never lands here. */
	multiplyDocumented: { component: string; files: string[] }[];
	/** `component={…}` references with no component source behind them: the
	 * identifier traces to nothing, or it traces to a path that isn't on disk.
	 * (`sdocs check` reports the missing import separately.) */
	unresolved: CoverageSite[];
	/** Documented components that lie outside the component globs — either the
	 * globs are too narrow, or the component lives outside the project. */
	documentedOutsideGlobs: string[];
}

/**
 * Measure documentation coverage.
 *
 * @param docFiles absolute `.sdoc` paths
 * @param componentGlobs absolute globs locating component sources
 * @param cwd project root, for the relative paths in the result
 */
export async function measureCoverage(
	docFiles: string[],
	componentGlobs: string[],
	cwd: string,
): Promise<CoverageResult> {
	const componentFiles = new Set(
		(await glob(componentGlobs, { cwd, absolute: true })).map((p) => p),
	);

	// Every `[component]` in the project, resolved to a component file.
	const sitesByComponent = new Map<string, CoverageSite[]>();
	const unresolved: CoverageSite[] = [];

	for (const docFile of docFiles) {
		const doc = parseSdoc(await readFile(docFile, 'utf-8'));
		const fileImports = extractImports(doc.script?.content ?? '');
		for (const entity of doc.entities) {
			if (entity.kind !== 'SHOWCASE') continue;
			const entityImports = entity.script ? extractImports(entity.script.content) : [];
			for (const preview of entity.previews) {
				if (!preview.componentName) continue;
				const site: CoverageSite = {
					file: relative(cwd, docFile),
					entity: entity.title,
					stage: preview.label,
					component: preview.componentName,
				};
				// Most local binding wins, matching the Explorer's own lookup.
				const blockImports = preview.script ? extractImports(preview.script.content) : [];
				const resolved = resolveComponentImport(
					preview.componentName,
					[...blockImports, ...entityImports, ...fileImports],
					docFile,
				);
				// A resolved path is a claim about the filesystem — the resolver
				// follows imports, it doesn't stat them. Verify before counting
				// the component as documented, so a preview pointing at a file
				// that isn't there reads as missing source, not as coverage.
				if (!resolved || !existsSync(resolved)) {
					unresolved.push(site);
					continue;
				}
				const list = sitesByComponent.get(resolved) ?? [];
				list.push(site);
				sitesByComponent.set(resolved, list);
			}
		}
	}

	const rel = (p: string) => relative(cwd, p);

	const undocumented = [...componentFiles]
		.filter((p) => !sitesByComponent.has(p))
		.map(rel)
		.sort();

	const documented = [...sitesByComponent.entries()]
		.filter(([p]) => componentFiles.has(p))
		.map(([p, sites]) => ({ component: rel(p), sites }))
		.sort((a, b) => a.component.localeCompare(b.component));

	const multiplyDocumented = documented
		.map(({ component, sites }) => ({
			component,
			files: [...new Set(sites.map((s) => s.file))],
		}))
		.filter((c) => c.files.length > 1);

	const documentedOutsideGlobs = [...sitesByComponent.keys()]
		.filter((p) => !componentFiles.has(p))
		.map(rel)
		.sort();

	return {
		componentGlobs: componentGlobs.map(rel),
		counts: {
			components: componentFiles.size,
			documented: documented.length,
			undocumented: undocumented.length,
		},
		undocumented,
		documented,
		multiplyDocumented,
		unresolved,
		documentedOutsideGlobs,
	};
}
