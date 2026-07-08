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
	const example = (e: ExampleLike) => ({
		name: e.title,
		slug: exampleSlug(e.title),
		role: 'example' as const,
		...blockParts(e),
	});
	if (entity.kind === 'SHOWCASE') {
		return [
			...entity.previews.map((p) => ({
				name: p.label,
				slug: previewSlug(p.label),
				role: 'preview' as const,
				...blockParts(p),
			})),
			...entity.examples.map(example),
		];
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
	if (entity.kind === 'DOC') {
		return [content, ...entity.examples.map(example)];
	}
	return [content];
}

interface ExampleLike {
	title: string;
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
