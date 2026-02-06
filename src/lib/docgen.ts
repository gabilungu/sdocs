import type { ArgType, CssProps, CssControlType, MethodType } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedProp {
	name: string;
	type: string;
	required: boolean;
	defaultValue?: string;
	description?: string;
}

export interface ExtractedCssProp {
	name: string;
	type?: CssControlType;
	description?: string;
	default?: string;
}

export interface ExtractedMethod {
	name: string;
	params?: string;
	returnType?: string;
	description?: string;
}

export interface ComponentDocgen {
	props: ExtractedProp[];
	cssProps: ExtractedCssProp[];
	methods: ExtractedMethod[];
	description?: string;
}

/** Types that can't be serialized as control values — component uses its own defaults */
const NON_SERIALIZABLE_TYPES = ['bigint', 'symbol', 'object', 'null', 'undefined'];

// ============================================================================
// Parsing - Extract props from component source
// ============================================================================

/**
 * Parse Svelte 5 component props from source code.
 * Supports both interface Props {} and inline type annotations.
 */
export function parseProps(source: string): ComponentDocgen {
	const props: ExtractedProp[] = [];
	const cssProps: ExtractedCssProp[] = [];
	let description: string | undefined;

	// Try to find Props interface with optional JSDoc comment before it
	const interfaceMatch = source.match(/(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?interface\s+Props\s*\{([^}]+)\}/);
	if (interfaceMatch) {
		// Extract component description and @cssvar tags from JSDoc before interface
		if (interfaceMatch[1]) {
			const { description: desc, cssVars } = parseJsDocBlock(interfaceMatch[1]);
			description = desc;
			cssProps.push(...cssVars);
		}
		const interfaceBody = interfaceMatch[2];
		props.push(...parseInterfaceBody(interfaceBody));
	}

	// Also check for inline type in $props destructuring
	// let { foo = 'bar' }: { foo?: string } = $props();
	const inlineMatch = source.match(/\$props\s*<\s*\{([^}]+)\}\s*>\s*\(\s*\)/s);
	if (inlineMatch && props.length === 0) {
		props.push(...parseInterfaceBody(inlineMatch[1]));
	}

	// Support JSDoc @type for JavaScript components
	// /** @type {{ label?: string, children?: import('svelte').Snippet }} */
	// let { label = 'default' } = $props();
	if (props.length === 0) {
		const jsdocTypeMatch = source.match(/\/\*\*\s*@type\s*\{\s*\{([^}]+)\}\s*\}\s*\*\/[\s\S]*?\$props\s*\(\s*\)/s);
		if (jsdocTypeMatch) {
			props.push(...parseJsDocTypeProps(jsdocTypeMatch[1]));
		}

		// For JS components, look for a separate JSDoc block with description/@cssvar
		// This is the block before the @type block (or before $props)
		if (!description) {
			const jsDocBlocks = source.match(/\/\*\*\s*([\s\S]*?)\s*\*\//g);
			if (jsDocBlocks) {
				for (const block of jsDocBlocks) {
					// Skip @type blocks
					if (block.includes('@type')) continue;
					const content = block.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '');
					const { description: desc, cssVars } = parseJsDocBlock(content);
					if (desc || cssVars.length > 0) {
						description = desc;
						cssProps.push(...cssVars);
						break;
					}
				}
			}
		}
	}

	// Extract default values from destructuring
	// let { foo = 'default', bar = 123 }: Props = $props();
	const destructureMatch = source.match(/let\s*\{([\s\S]*?)\}[^=]*=\s*\$props\s*\(\s*\)/s);
	if (destructureMatch) {
		const destructure = destructureMatch[1];
		const defaults = parseDestructureDefaults(destructure);

		// Merge defaults into props
		for (const prop of props) {
			if (defaults[prop.name] !== undefined) {
				prop.defaultValue = defaults[prop.name];
				prop.required = false;
			}
		}
	}

	// Extract exported functions
	const methods = parseExportedFunctions(source);

	return { props, cssProps, methods, description };
}

function parseInterfaceBody(body: string): ExtractedProp[] {
	const props: ExtractedProp[] = [];

	// Match lines like:
	// propName?: type;
	// propName: type;
	// /** description */ propName?: type;
	const propRegex = /(?:\/\*\*\s*([^*]*)\s*\*\/\s*)?(\w+)(\?)?\s*:\s*([^;]+);/g;

	let match;
	while ((match = propRegex.exec(body)) !== null) {
		const [, description, name, optional, type] = match;

		// Skip internal Svelte props only
		if (name.startsWith('$$')) {
			continue;
		}

		props.push({
			name,
			type: type.trim(),
			required: !optional,
			description: description?.trim()
		});
	}

	return props;
}

/**
 * Parse props from JSDoc @type annotation
 * Format: { propName?: type, propName2: type2 }
 */
function parseJsDocTypeProps(typeBody: string): ExtractedProp[] {
	const props: ExtractedProp[] = [];

	// Match: propName?: type or propName: type
	// Type can include import('svelte').Snippet or simple types
	const propRegex = /(\w+)(\?)?\s*:\s*([^,}]+)/g;

	let match;
	while ((match = propRegex.exec(typeBody)) !== null) {
		const [, name, optional, type] = match;

		// Skip internal props
		if (name.startsWith('$$')) {
			continue;
		}

		props.push({
			name,
			type: type.trim(),
			required: !optional
		});
	}

	return props;
}

function parseDestructureDefaults(destructure: string): Record<string, string> {
	const defaults: Record<string, string> = {};

	// Match: name = value
	// Handle strings, numbers, booleans
	const defaultRegex = /(\w+)\s*=\s*(['"`]?)([^,}]+?)\2(?:\s*,|\s*$)/g;

	let match;
	while ((match = defaultRegex.exec(destructure)) !== null) {
		const [, name, quote, value] = match;
		// Clean up the value
		let cleanValue = value.trim();

		// If it was quoted, add quotes back for string identification
		if (quote) {
			cleanValue = quote + cleanValue + quote;
		}

		defaults[name] = cleanValue;
	}

	return defaults;
}

/**
 * Parse exported functions from component source code.
 * Supports both TS and JS: export function name(params): returnType
 * With optional JSDoc comment before.
 */
function parseExportedFunctions(source: string): ExtractedMethod[] {
	const methods: ExtractedMethod[] = [];

	// Match optional JSDoc followed by export function
	const methodRegex = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?export\s+function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([\w<>[\]|&\s,]+))?\s*\{/g;

	let match;
	while ((match = methodRegex.exec(source)) !== null) {
		const [, jsDoc, name, params, returnType] = match;

		// Extract description from JSDoc (just the text, skip tags)
		let description: string | undefined;
		if (jsDoc) {
			const lines = jsDoc.split('\n').map(line => line.replace(/^\s*\*\s?/, '').trim());
			const descLines = lines.filter(l => l.length > 0 && !l.startsWith('@'));
			description = descLines.length > 0 ? descLines.join(' ').trim() : undefined;
		}

		methods.push({
			name,
			params: params.trim() || undefined,
			returnType: returnType?.trim() || 'void',
			description
		});
	}

	return methods;
}

/**
 * Parse JSDoc block to extract description and @cssvar tags
 * Format: @cssvar {type} --name - description (default: value)
 */
function parseJsDocBlock(comment: string): { description?: string; cssVars: ExtractedCssProp[] } {
	const cssVars: ExtractedCssProp[] = [];
	const descriptionLines: string[] = [];

	const lines = comment.split('\n').map(line => line.replace(/^\s*\*\s?/, '').trim());

	for (const line of lines) {
		// Match @cssvar {type} --name - description (default: value)
		// Type is optional: @cssvar --name - description
		const cssvarMatch = line.match(
			/@cssvar\s+(?:\{(\w+)\}\s+)?(--[\w-]+)\s*(?:-\s*(.+))?/
		);

		if (cssvarMatch) {
			const [, type, name, rest] = cssvarMatch;
			let description: string | undefined;
			let defaultValue: string | undefined;

			if (rest) {
				// Extract default value from "(default: value)" at the end
				const defaultMatch = rest.match(/^(.+?)\s*\(default:\s*([^)]+)\)\s*$/);
				if (defaultMatch) {
					description = defaultMatch[1].trim();
					defaultValue = defaultMatch[2].trim();
				} else {
					description = rest.trim();
				}
			}

			cssVars.push({
				name,
				type: type as CssControlType | undefined,
				description,
				default: defaultValue
			});
		} else if (!line.startsWith('@') && line.length > 0) {
			// Regular description line (not a tag)
			descriptionLines.push(line);
		}
	}

	return {
		description: descriptionLines.length > 0 ? descriptionLines.join(' ').trim() : undefined,
		cssVars
	};
}

// ============================================================================
// Conversion - Transform parsed props to runtime types
// ============================================================================

/**
 * Convert extracted component props to argTypes for controls
 */
export function propsToArgTypes(docgen: ComponentDocgen | undefined): Record<string, ArgType> {
	if (!docgen?.props) return {};

	const argTypes: Record<string, ArgType> = {};

	for (const prop of docgen.props) {
		// Skip internal Svelte props
		if (prop.name.startsWith('$$')) {
			continue;
		}

		const argType = inferArgType(prop);
		argTypes[prop.name] = argType;
	}

	return argTypes;
}

/**
 * Extract default args from component docgen
 */
export function propsToDefaultArgs(docgen: ComponentDocgen | undefined): Record<string, unknown> {
	if (!docgen?.props) return {};

	const args: Record<string, unknown> = {};

	for (const prop of docgen.props) {
		if (prop.name === 'children' || prop.name === 'class' || prop.name.startsWith('$$')) {
			continue;
		}

		// Skip types that can't be represented as control values
		const typeLower = prop.type.toLowerCase();
		if (NON_SERIALIZABLE_TYPES.includes(typeLower) || typeLower.includes('=>') || typeLower.includes('function')) {
			continue;
		}

		if (prop.defaultValue !== undefined) {
			args[prop.name] = parseDefaultValue(prop.defaultValue, prop.type);
		}
	}

	return args;
}

/**
 * Convert extracted CSS props to CssProps config
 */
export function cssVarsToCssProps(docgen: ComponentDocgen | undefined): CssProps {
	if (!docgen?.cssProps) return {};

	const cssProps: CssProps = {};

	for (const cssProp of docgen.cssProps) {
		cssProps[cssProp.name] = {
			description: cssProp.description,
			default: cssProp.default,
			control: cssProp.type ?? 'color' // default to color picker
		};
	}

	return cssProps;
}

/**
 * Convert extracted methods to MethodType[] for the UI
 */
export function docgenToMethods(docgen: ComponentDocgen | undefined): MethodType[] {
	if (!docgen?.methods) return [];
	return docgen.methods.map((m) => ({
		name: m.name,
		params: m.params,
		returnType: m.returnType,
		description: m.description
	}));
}

// ============================================================================
// Helpers
// ============================================================================

function inferArgType(prop: ExtractedProp): ArgType {
	const type = prop.type.toLowerCase();
	const originalType = prop.type;
	const defaultValue = prop.defaultValue;

	// Snippet types - show in table but not controllable
	// Normalize display: import('svelte').Snippet -> Snippet
	if (type.includes('snippet')) {
		const snippetType = originalType.includes('import(') ? 'Snippet' : originalType;
		return {
			control: false,
			type: { name: snippetType },
			description: prop.description,
			required: prop.required,
			defaultValue
		};
	}

	// Function types (callbacks, event handlers) - show but not controllable
	if (type.includes('=>') || type.includes('function')) {
		return {
			control: false,
			type: { name: 'Function' },
			description: prop.description,
			required: prop.required,
			defaultValue
		};
	}

	// Non-serializable types - show but not controllable
	if (NON_SERIALIZABLE_TYPES.includes(type)) {
		return {
			control: false,
			type: { name: originalType },
			description: prop.description,
			required: prop.required,
			defaultValue
		};
	}

	// children prop - show but not controllable
	if (prop.name === 'children') {
		return {
			control: false,
			type: { name: originalType },
			description: prop.description,
			required: prop.required,
			defaultValue
		};
	}

	// class prop - text input
	if (prop.name === 'class') {
		return {
			control: 'text',
			type: { name: 'string' },
			description: prop.description,
			required: prop.required,
			defaultValue
		};
	}

	// Boolean
	if (type === 'boolean' || type === 'bool') {
		return { control: 'boolean', type: { name: 'boolean' }, description: prop.description, required: prop.required, defaultValue };
	}

	// Number
	if (type === 'number' || type === 'int' || type === 'float') {
		return { control: 'number', type: { name: 'number' }, description: prop.description, required: prop.required, defaultValue };
	}

	// Union types (string literals) -> select or radio
	const unionMatch = prop.type.match(/^['"]([^'"]+)['"](?:\s*\|\s*['"]([^'"]+)['"])+$/);
	if (unionMatch) {
		const options = extractUnionOptions(prop.type);
		if (options.length <= 4) {
			return {
				control: { type: 'radio', options },
				type: { name: originalType },
				description: prop.description,
				required: prop.required,
				defaultValue
			};
		}
		return {
			control: { type: 'select', options },
			type: { name: originalType },
			description: prop.description,
			required: prop.required,
			defaultValue
		};
	}

	// Explicit union check with pipe (string literals)
	if (prop.type.includes('|') && prop.type.includes("'")) {
		const options = extractUnionOptions(prop.type);
		if (options.length > 0) {
			if (options.length <= 4) {
				return {
					control: { type: 'radio', options },
					type: { name: originalType },
					description: prop.description,
					required: prop.required,
					defaultValue
				};
			}
			return {
				control: { type: 'select', options },
				type: { name: originalType },
				description: prop.description,
				required: prop.required,
				defaultValue
			};
		}
	}

	// Number literal unions (e.g., 20 | 24 | 28 | 32 | 40)
	if (prop.type.includes('|')) {
		const numberOptions = extractNumberUnionOptions(prop.type);
		if (numberOptions.length > 0) {
			if (numberOptions.length <= 5) {
				return {
					control: { type: 'radio', options: numberOptions },
					type: { name: originalType },
					description: prop.description,
					required: prop.required,
					defaultValue
				};
			}
			return {
				control: { type: 'select', options: numberOptions },
				type: { name: originalType },
				description: prop.description,
				required: prop.required,
				defaultValue
			};
		}
	}

	// String (fallback for most text types)
	if (type === 'string' || type.includes('string')) {
		return { control: 'text', type: { name: 'string' }, description: prop.description, required: prop.required, defaultValue };
	}

	// Default to text for unknown types
	return { control: 'text', type: { name: originalType }, description: prop.description, required: prop.required, defaultValue };
}

function extractUnionOptions(typeStr: string): string[] {
	const matches = typeStr.match(/['"]([^'"]+)['"]/g);
	if (!matches) return [];
	return matches.map((m) => m.replace(/['"]/g, ''));
}

function extractNumberUnionOptions(typeStr: string): string[] {
	// Match number literals in unions like "20 | 24 | 28 | 32 | 40"
	const parts = typeStr.split('|').map((s) => s.trim());
	const numbers: string[] = [];
	for (const part of parts) {
		if (/^\d+$/.test(part)) {
			numbers.push(part);
		}
	}
	// Only return if all parts are numbers
	return numbers.length === parts.length ? numbers : [];
}

function parseDefaultValue(value: string, type: string): unknown {
	// Handle boolean
	if (value === 'true') return true;
	if (value === 'false') return false;

	// Handle number (including number literal unions like "20 | 24 | 32")
	const num = Number(value);
	if (!isNaN(num)) {
		const isNumberType = type.toLowerCase().includes('number');
		const isNumberUnion = extractNumberUnionOptions(type).length > 0;
		if (isNumberType || isNumberUnion) {
			return num;
		}
	}

	// Handle string with quotes
	if (value.startsWith("'") || value.startsWith('"')) {
		return value.slice(1, -1);
	}

	return value;
}
