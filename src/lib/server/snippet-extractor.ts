import type { ExtractedSnippet } from '../types.js';

/** Extract top-level {#snippet} blocks from .sdoc source, handling nested snippets */
export function extractSnippets(source: string): ExtractedSnippet[] {
	const snippets: ExtractedSnippet[] = [];

	// Strip <script> and <style> to search only markup
	const markup = source
		.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

	const openRegex = /\{#snippet\s+(\w+)\s*\([^)]*\)\}/g;
	let match;
	let searchFrom = 0;

	while (true) {
		openRegex.lastIndex = searchFrom;
		match = openRegex.exec(markup);
		if (!match) break;

		const name = match[1];
		const bodyStart = match.index + match[0].length;

		// Count nesting depth to find the matching {/snippet}
		let depth = 1;
		let i = bodyStart;

		while (i < markup.length && depth > 0) {
			if (markup.startsWith('{/snippet}', i)) {
				depth--;
				if (depth === 0) break;
				i += '{/snippet}'.length;
			} else if (markup.startsWith('{#snippet', i)) {
				depth++;
				const closeBrace = markup.indexOf('}', i);
				i = closeBrace !== -1 ? closeBrace + 1 : i + 1;
			} else {
				i++;
			}
		}

		if (depth === 0) {
			const body = markup.slice(bodyStart, i).trim();
			snippets.push({ name, body });
			searchFrom = i + '{/snippet}'.length;
		} else {
			break; // malformed source, stop
		}
	}

	return snippets;
}

/** Check if a Default snippet exists or needs auto-generation */
export function hasDefaultSnippet(snippets: ExtractedSnippet[]): boolean {
	return snippets.some((s) => s.name === 'Default');
}

/** Generate an auto-generated Default snippet body */
export function generateAutoDefault(
	componentName: string,
): string {
	return `<${componentName} {...args} />`;
}

/** Extract the markup body of a .sdoc file (everything outside <script> and <style>) */
export function extractMarkupBody(source: string): string {
	return source
		.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.trim();
}

/** Get the snippet names in order (Default first, then alphabetical) */
export function getSnippetOrder(snippets: ExtractedSnippet[]): string[] {
	const names = snippets.map((s) => s.name);
	const defaultIndex = names.indexOf('Default');
	if (defaultIndex > 0) {
		names.splice(defaultIndex, 1);
		names.unshift('Default');
	}
	return names;
}
