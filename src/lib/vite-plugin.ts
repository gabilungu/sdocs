import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { parseProps, type ComponentDocgen } from './docgen.js';

const VIRTUAL_MODULE_ID = 'virtual:sdocs';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

export interface SdocsPluginOptions {
	/**
	 * Glob pattern(s) to find doc files.
	 * @default '$lib/**\/*.docs.{svelte,svx}'
	 */
	include?: string | string[];
}

/**
 * Extract export order from a .docs.svelte file
 * Returns array of exported names in order
 */
function extractExportOrder(source: string): string[] {
	// Match: export { Name1, Name2, Name3 }
	const exportMatch = source.match(/export\s*\{([^}]+)\}/);
	if (exportMatch) {
		return exportMatch[1]
			.split(',')
			.map(s => s.trim())
			.filter(s => s && s !== 'meta');
	}
	return [];
}

/**
 * Extract snippet source code from a .docs.svelte file
 * Returns a map of snippet name -> source code
 */
function extractSnippetSources(source: string): Record<string, string> {
	const snippets: Record<string, string> = {};

	// Match {#snippet Name(args)}...{/snippet} blocks
	// Using a simple approach that handles nested braces
	const snippetRegex = /\{#snippet\s+(\w+)\s*\([^)]*\)\}/g;
	let match;

	while ((match = snippetRegex.exec(source)) !== null) {
		const snippetName = match[1];
		const startIndex = match.index;
		const startTag = match[0];
		const contentStart = startIndex + startTag.length;

		// Find the matching {/snippet} by counting nesting
		let depth = 1;
		let pos = contentStart;

		while (depth > 0 && pos < source.length) {
			const nextOpen = source.indexOf('{#snippet', pos);
			const nextClose = source.indexOf('{/snippet}', pos);

			if (nextClose === -1) break;

			if (nextOpen !== -1 && nextOpen < nextClose) {
				depth++;
				pos = nextOpen + 9; // length of '{#snippet'
			} else {
				depth--;
				if (depth === 0) {
					// Extract the content between start tag and {/snippet}
					const content = source.slice(contentStart, nextClose).trim();
					snippets[snippetName] = content;
				}
				pos = nextClose + 10; // length of '{/snippet}'
			}
		}
	}

	return snippets;
}

/**
 * Vite plugin that extracts prop information from Svelte 5 components
 * and attaches it as __docgen metadata for runtime access.
 * Also extracts snippet source code from doc files.
 * Provides a virtual module for auto-loading doc files.
 */
export function sdocsPlugin(options: SdocsPluginOptions = {}): Plugin {
	const docgenCache = new Map<string, ComponentDocgen>();
	const snippetSourceCache = new Map<string, Record<string, string>>();

	// Normalize include patterns
	const includePatterns = options.include
		? Array.isArray(options.include)
			? options.include
			: [options.include]
		: ['$lib/**/*.docs.{svelte,svx}'];

	// Generate the virtual module code with import.meta.glob
	function generateVirtualModuleCode(): string {
		const globs = includePatterns
			.map((pattern) => `import.meta.glob('${pattern}', { eager: true })`)
			.join(',\n  ');

		if (includePatterns.length === 1) {
			return `export const docs = ${globs};`;
		}

		// Multiple patterns - merge them
		return `const modules = [
  ${globs}
];
export const docs = Object.assign({}, ...modules);`;
	}

	return {
		name: 'sdocs',
		enforce: 'post', // Run after Svelte plugin compiles to JS

		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				return generateVirtualModuleCode();
			}
		},

		configureServer(devServer) {
			// Watch for new/deleted doc files and trigger full reload
			// This fixes the issue where import.meta.glob doesn't detect new files
			devServer.watcher.on('add', (file) => {
				if (file.includes('.docs.svelte') || file.includes('.docs.svx')) {
					console.log(`[sdocs] New doc file detected: ${file}`);
					// Send full reload to pick up new glob entries
					devServer.ws.send({ type: 'full-reload' });
				}
			});

			devServer.watcher.on('unlink', (file) => {
				if (file.includes('.docs.svelte') || file.includes('.docs.svx')) {
					console.log(`[sdocs] Doc file removed: ${file}`);
					devServer.ws.send({ type: 'full-reload' });
				}
			});
		},

		transform(code: string, id: string) {
			const isSvelte = id.endsWith('.svelte');
			const isSvx = id.endsWith('.svx');

			if (!isSvelte && !isSvx) {
				return null;
			}

			// Handle doc files - extract snippet source code and export order (both .svelte and .svx)
			if (id.includes('.docs.')) {
				try {
					const source = readFileSync(id, 'utf-8');
					const snippetSources = extractSnippetSources(source);
					const exampleOrder = extractExportOrder(source);

					const hasSnippets = Object.keys(snippetSources).length > 0;
					const hasOrder = exampleOrder.length > 0;

					if (hasSnippets || hasOrder) {
						snippetSourceCache.set(id, snippetSources);

						// Add exports to the compiled module
						let newCode = code;
						if (hasSnippets) {
							newCode += `\nexport const __snippetSources = ${JSON.stringify(snippetSources)};`;
						}
						if (hasOrder) {
							newCode += `\nexport const __exampleOrder = ${JSON.stringify(exampleOrder)};`;
						}
						return { code: newCode + '\n', map: null };
					}
				} catch (err) {
					if (process.env.DEBUG) {
						console.warn(`[sdocs] Failed to extract snippets from ${id}:`, err);
					}
				}
				return null;
			}

			// Handle regular component files - extract prop docgen (only .svelte, not .svx)
			if (!isSvelte) {
				return null;
			}

			// Skip internal sdocs components - they don't need docgen
			if (id.includes('/internal/') || id.includes('\\internal\\')) {
				return null;
			}

			try {
				// Read the original source file to parse props
				const source = readFileSync(id, 'utf-8');
				const docgen = parseProps(source);

				if (docgen.props.length > 0 || docgen.methods.length > 0) {
					docgenCache.set(id, docgen);

					// The Svelte plugin has already compiled to JS
					// Find the default export and attach __docgen to it
					const docgenJson = JSON.stringify(docgen);

					// Look for the component export pattern in compiled Svelte 5 code
					// Pattern: "export default <ComponentName>" (client) or "export default function <Name>" (SSR)
					if (code.includes('export default')) {
						// Match "export default ComponentName" but not "export default function"
						const exportMatch = code.match(/export\s+default\s+(?!function\b)(\w+)/);
						if (exportMatch) {
							const componentName = exportMatch[1];
							// Add docgen assignment before the export
							const modifiedCode = code.replace(
								new RegExp(`(export\\s+default\\s+)(${componentName})`),
								`${componentName}.__docgen = ${docgenJson};\n$1$2`
							);
							return { code: modifiedCode, map: null };
						}
						// For SSR: "export default function ComponentName" - skip docgen injection
						// SSR components are not interactive, docgen is only needed for client
					}
				}
			} catch (err) {
				if (process.env.DEBUG) {
					console.warn(`[sdocs] Failed to parse ${id}:`, err);
				}
			}

			return null;
		}
	};
}

export type { ComponentDocgen };

export default sdocsPlugin;
