import { parse } from 'svelte/compiler';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { SdocMeta } from '../types.js';

interface MetaParseResult {
	meta: SdocMeta;
	componentPath: string | null;
	imports: string[];
}

/** Extract meta and imports from a .sdoc file */
export async function parseDocFile(filePath: string): Promise<MetaParseResult> {
	const source = await readFile(filePath, 'utf-8');
	return parseDocSource(source, filePath);
}

/** Parse meta from .sdoc source */
export function parseDocSource(source: string, filePath: string): MetaParseResult {
	const ast = parse(source, { modern: true });
	const scriptContent = extractScriptContent(source);
	if (!scriptContent) {
		return {
			meta: { title: guessTitle(filePath) },
			componentPath: null,
			imports: [],
		};
	}

	const imports = extractImports(scriptContent);
	const meta = extractMeta(scriptContent);
	const componentPath = resolveComponentPath(meta, imports, filePath);

	return { meta, componentPath, imports };
}

/** Extract the content of the <script> tag */
function extractScriptContent(source: string): string | null {
	const match = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
	return match ? match[1] : null;
}

/** Extract import statements */
function extractImports(scriptContent: string): string[] {
	const imports: string[] = [];
	const regex = /^\s*import\s+.+$/gm;
	let match;
	while ((match = regex.exec(scriptContent)) !== null) {
		imports.push(match[0].trim());
	}
	return imports;
}

/** Extract meta object from `export const meta = { ... }` using brace counting */
function extractMeta(scriptContent: string): SdocMeta {
	// Find where the meta object starts
	const startMatch = scriptContent.match(
		/export\s+const\s+meta\s*(?::\s*\w+\s*)?=\s*\{/,
	);
	if (!startMatch || startMatch.index === undefined) return { title: 'Untitled' };

	// Find the opening brace
	const braceStart = startMatch.index + startMatch[0].length - 1;
	let depth = 1;
	let i = braceStart + 1;

	// Count braces to find the matching closing brace
	while (i < scriptContent.length && depth > 0) {
		const ch = scriptContent[i];
		if (ch === '{') depth++;
		else if (ch === '}') depth--;
		// Skip strings
		else if (ch === "'" || ch === '"' || ch === '`') {
			i++;
			while (i < scriptContent.length && scriptContent[i] !== ch) {
				if (scriptContent[i] === '\\') i++; // skip escaped chars
				i++;
			}
		}
		i++;
	}

	const metaStr = scriptContent.slice(braceStart, i);

	try {
		// Replace component: Identifier with component: 'Identifier'
		const cleaned = metaStr.replace(
			/component:\s*([A-Z]\w*)/,
			"component: '$1'",
		);

		const fn = new Function(`return (${cleaned})`);
		const result = fn();
		return result as SdocMeta;
	} catch {
		return extractMetaFields(metaStr);
	}
}

/** Fallback: extract meta fields with regex */
function extractMetaFields(metaStr: string): SdocMeta {
	const title = metaStr.match(/title:\s*['"](.+?)['"]/)?.[1] ?? 'Untitled';
	const description = metaStr.match(/description:\s*['"](.+?)['"]/)?.[1];

	return { title, description };
}

/** Resolve the component import path to an absolute path */
function resolveComponentPath(
	meta: SdocMeta,
	imports: string[],
	docFilePath: string,
): string | null {
	const componentValue =
		typeof meta.component === 'string' ? meta.component : null;
	if (!componentValue) return null;

	// If component is a relative path (e.g. './Button.svelte'), resolve directly
	if (componentValue.startsWith('./') || componentValue.startsWith('../')) {
		return resolve(dirname(docFilePath), componentValue);
	}

	// Otherwise it's an identifier (e.g. 'Button') — find matching import
	for (const imp of imports) {
		const match = imp.match(
			new RegExp(
				`import\\s+${componentValue}\\s+from\\s+['"](.+?)['"]`,
			),
		);
		if (match) {
			const importPath = match[1];
			return resolve(dirname(docFilePath), importPath);
		}
	}

	return null;
}

/** Guess a title from the file path */
function guessTitle(filePath: string): string {
	const fileName = filePath.split('/').pop() ?? '';
	return fileName.replace(/\.sdoc$/, '').replace(/\./g, ' ');
}
