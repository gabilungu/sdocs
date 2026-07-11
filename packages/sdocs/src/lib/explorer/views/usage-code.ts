/**
 * Pure helpers behind the "Preview Code" panel: turn the current control
 * values into copy-pasteable Svelte.
 *
 * Value semantics: `undefined`/`null` means **unset** — the prop is absent and
 * the component uses its own default. An empty string is a real value and
 * renders as `name=""`.
 */

/** One attribute, formatted the way it would be written in markup. */
export function formatAttr(name: string, value: unknown): string {
	if (typeof value === 'string') return `${name}="${value}"`;
	if (typeof value === 'boolean') return value ? name : `${name}={false}`;
	return `${name}={${JSON.stringify(value)}}`;
}

/** The set values as an object literal for a `const args = { … }` line. */
export function argsObjectLiteral(props: Record<string, unknown>): string {
	const entries = Object.entries(props)
		.filter(([, v]) => v !== undefined && v !== null)
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `{ ${entries.join(', ')} }`;
}

/** A minimal `<X …/>` when the preview has no snippet body to patch. */
export function generateFallbackCode(
	name: string,
	props: Record<string, unknown>,
	css: Record<string, string>,
): string {
	const attrs: string[] = [];
	for (const [key, value] of Object.entries(props)) {
		if (value === undefined || value === null) continue;
		attrs.push(formatAttr(key, value));
	}
	for (const [key, value] of Object.entries(css)) {
		if (value === undefined || value === '') continue;
		attrs.push(`${key}="${value}"`);
	}
	if (attrs.length === 0) return `<${name} />`;
	if (attrs.length <= 2) return `<${name} ${attrs.join(' ')} />`;
	return `<${name}\n  ${attrs.join('\n  ')}\n/>`;
}

/**
 * Make the shown code copy-pasteable: a plain {...args} spread resolves to
 * the current control values as concrete attributes; a body that uses
 * `args` in richer ways ({args.x}, foo={args}) instead gains a real
 * `const args = { … }` line, so the code always runs as written.
 */
export function resolveArgsInCode(body: string, props: Record<string, unknown>): string {
	const SPREAD = '{...args}';
	const beyondSpread = /\bargs\b/.test(body.split(SPREAD).join(''));
	if (beyondSpread) {
		const constLine = `const args = ${argsObjectLiteral(props)};`;
		if (/^\s*<script/.test(body)) {
			// Body already opens with a block script — declare args first in it.
			return body.replace(/(<script[^>]*>\n?)/, `$1\t${constLine}\n`);
		}
		return ['<script>', '\t' + constLine, '</scr' + 'ipt>', body].join('\n');
	}
	if (body.includes(SPREAD)) {
		const attrs = Object.entries(props)
			.filter(([, v]) => v !== undefined && v !== null)
			.filter(([k]) => !new RegExp(`\\b${k}=`).test(body))
			.map(([k, v]) => formatAttr(k, v));
		const expanded = body
			.replace(SPREAD, attrs.join(' '))
			.replace(/ {2,}/g, ' ')
			.replace(/<(\w[\w.]*) \/>/g, '<$1 />')
			.replace(/ >/g, '>');
		return expanded;
	}
	return body;
}

/**
 * Patch the snippet body with prop/CSS changes from Controls: the root
 * component tag gains, updates — and, for props unset since the initial
 * args, loses — attributes.
 */
export function patchSnippetCode(
	snippetBody: string,
	name: string,
	currentProps: Record<string, unknown>,
	currentCss: Record<string, string>,
	initialProps: Record<string, unknown>,
	initialCss: Record<string, string>,
): string {
	// Collect only changed props/css — and initial props that were unset.
	const changes: [string, unknown][] = [];
	const removals: string[] = [];
	for (const [key, value] of Object.entries(currentProps)) {
		if (JSON.stringify(value) !== JSON.stringify(initialProps[key])) {
			changes.push([key, value]);
		}
	}
	for (const key of Object.keys(initialProps)) {
		if (!(key in currentProps) || currentProps[key] === undefined) {
			removals.push(key);
		}
	}
	for (const [key, value] of Object.entries(currentCss)) {
		if (value !== (initialCss[key] ?? '')) {
			changes.push([key, value]);
		}
	}

	if (changes.length === 0 && removals.length === 0) return snippetBody;

	// A block-level <script> can mention the component name (in a string,
	// a comment, an import) — only search the markup after it. (The tag is
	// split so this file's own script doesn't end here.)
	const scriptCloseTag = '</scr' + 'ipt>';
	const scriptClose = snippetBody.indexOf(scriptCloseTag);
	const searchFrom = scriptClose === -1 ? 0 : scriptClose + scriptCloseTag.length;

	// Find the opening tag: <ComponentName ...> or <ComponentName ... />
	// (whole-name match, so <Tab doesn't hit <Tabs)
	const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const tagMatch = snippetBody.slice(searchFrom).match(new RegExp(`<${escapedName}(?=[\\s/>])`));
	if (!tagMatch || tagMatch.index === undefined) return snippetBody;
	const tagStart = searchFrom + tagMatch.index;

	// Find the end of the opening tag, respecting {} expressions
	let braceDepth = 0;
	let tagEnd = -1;
	for (let i = tagStart + name.length + 1; i < snippetBody.length; i++) {
		if (snippetBody[i] === '{') braceDepth++;
		else if (snippetBody[i] === '}') braceDepth--;
		else if (braceDepth === 0 && snippetBody[i] === '>') {
			tagEnd = i;
			break;
		}
	}
	if (tagEnd === -1) return snippetBody;

	const isSelfClosing = snippetBody[tagEnd - 1] === '/';
	const attrsStart = tagStart + `<${name}`.length;
	const attrsEnd = isSelfClosing ? tagEnd - 1 : tagEnd;
	let attrs = snippetBody.slice(attrsStart, attrsEnd);

	const patternsFor = (attrName: string) => {
		const escaped = attrName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
		// name="...", name={...}, or bare name
		return [
			new RegExp(`(\\s)${escaped}="[^"]*"`),
			new RegExp(`(\\s)${escaped}=\\{[^}]*\\}`),
			new RegExp(`(\\s)${escaped}(?=\\s|$)`),
		];
	};

	for (const attrName of removals) {
		for (const pattern of patternsFor(attrName)) {
			if (pattern.test(attrs)) {
				attrs = attrs.replace(pattern, '');
				break;
			}
		}
	}

	for (const [attrName, value] of changes) {
		const formatted = formatAttr(attrName, value);
		let replaced = false;
		for (const pattern of patternsFor(attrName)) {
			if (pattern.test(attrs)) {
				attrs = attrs.replace(pattern, `$1${formatted}`);
				replaced = true;
				break;
			}
		}
		if (!replaced) {
			attrs += ` ${formatted}`;
		}
	}

	const closing = isSelfClosing ? '/>' : '>';
	return snippetBody.slice(0, attrsStart) + attrs + closing + snippetBody.slice(tagEnd + 1);
}
