/**
 * Shared entity → snippet planning. Both the Vite plugin (URL generation)
 * and the CLI app-gen (pre-computed rollup inputs) derive snippet slugs
 * from this module, so build inputs always byte-match plugin output.
 */

import { resolve, dirname } from 'node:path';
import { slugifyTitle, type SdocEntity } from '../language/index.js';

export type SnippetRole = 'preview' | 'example' | 'content';

export interface PlannedSnippet {
	name: string;
	slug: string;
	role: SnippetRole;
	body: string;
}

/** URL-safe slug for an example snippet. The 'x-' prefix keeps example
 * slugs disjoint from preview slugs and 'content'. */
export function exampleSlug(title: string): string {
	return 'x-' + slugifyTitle(title);
}

/** URL-safe slug for a preview snippet (from its tab label). */
export function previewSlug(label: string): string {
	return slugifyTitle(label);
}

/** The snippets one entity produces, in order: previews, then examples,
 * or the single 'content' body for PAGE/LAYOUT. */
export function planEntitySnippets(entity: SdocEntity): PlannedSnippet[] {
	if (entity.kind === 'DOCS') {
		return [
			...entity.previews.map((p) => ({
				name: p.label,
				slug: previewSlug(p.label),
				role: 'preview' as const,
				body: p.body,
			})),
			...entity.examples.map((e) => ({
				name: e.title,
				slug: exampleSlug(e.title),
				role: 'example' as const,
				body: e.body,
			})),
		];
	}
	return [{ name: 'Content', slug: 'content', role: 'content', body: entity.body }];
}

/** Extract import statements from the file-level script content. */
export function extractImports(scriptContent: string): string[] {
	const imports: string[] = [];
	const regex = /^\s*import\s+.+$/gm;
	let match;
	while ((match = regex.exec(scriptContent)) !== null) {
		imports.push(match[0].trim());
	}
	return imports;
}

/** Resolve a preview's component identifier to an absolute .svelte path via
 * the file's imports. Returns null when the identifier isn't imported. */
export function resolveComponentImport(
	componentName: string,
	imports: string[],
	docFilePath: string,
): string | null {
	for (const imp of imports) {
		const match = imp.match(
			new RegExp(`import\\s+${componentName}\\s+from\\s+['"](.+?)['"]`),
		);
		if (match) {
			return resolve(dirname(docFilePath), match[1]);
		}
	}
	return null;
}
