import * as vscode from 'vscode';

const META_FIELDS: { label: string; detail: string; documentation: string }[] = [
	{
		label: 'component',
		detail: 'The Svelte component being documented',
		documentation: 'Import reference to the Svelte component. Example: `component: Button`',
	},
	{
		label: 'title',
		detail: "Sidebar path (e.g. 'Demo / Button')",
		documentation:
			"Sets the display title and sidebar tree location. Use ' / ' to create folder nesting. Example: `title: 'Components / Button'`",
	},
	{
		label: 'description',
		detail: 'Short description',
		documentation: 'Brief description shown in the component header. Example: `description: \'A versatile button component.\'`',
	},
	{
		label: 'args',
		detail: 'Default prop values',
		documentation:
			'Object with default prop values passed to snippets. Example: `args: { label: \'Click me\', size: \'md\' }`',
	},
	{
		label: 'settings',
		detail: 'Preview settings',
		documentation:
			'Object with preview iframe settings (padding, background, etc.). Example: `settings: { padding: \'20px\' }`',
	},
];

interface ScanState {
	depth: number;
	quote: string;
	escaped: boolean;
	comment: '' | 'line' | 'block';
}

/** True while the scanner is in plain code (not in a string or comment). */
function inCode(state: ScanState): boolean {
	return !state.quote && !state.comment && !state.escaped;
}

/** Process text[i] (and possibly text[i+1]); returns how many chars were consumed. */
function step(text: string, i: number, state: ScanState): number {
	const ch = text[i];
	if (state.escaped) {
		state.escaped = false;
		return 1;
	}
	if (state.comment === 'line') {
		if (ch === '\n') state.comment = '';
		return 1;
	}
	if (state.comment === 'block') {
		if (ch === '*' && text[i + 1] === '/') {
			state.comment = '';
			return 2;
		}
		return 1;
	}
	if (state.quote) {
		if (ch === '\\') state.escaped = true;
		else if (ch === state.quote) state.quote = '';
		return 1;
	}
	if (ch === '/' && text[i + 1] === '/') {
		state.comment = 'line';
		return 2;
	}
	if (ch === '/' && text[i + 1] === '*') {
		state.comment = 'block';
		return 2;
	}
	if (ch === "'" || ch === '"' || ch === '`') state.quote = ch;
	else if (ch === '{') state.depth++;
	else if (ch === '}') state.depth--;
	return 1;
}

export class MetaCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] | undefined {
		const text = document.getText();
		const offset = document.offsetAt(position);

		// Find the last `export const meta` declaration before the cursor.
		let declStart = -1;
		for (const match of text.matchAll(/^[ \t]*export\s+const\s+meta\b/gm)) {
			if (match.index > offset) break;
			declStart = match.index;
		}
		if (declStart === -1) return undefined;

		// Walk from the declaration to the cursor: skip a possible type
		// annotation, find the object literal's `{` (the first one after the
		// depth-0 `=`), and track whether the object is still open at the cursor.
		// Strings and comments don't count toward brace depth.
		const state: ScanState = { depth: 0, quote: '', escaped: false, comment: '' };
		let braceOpen = -1;
		let eqSeen = false;
		let i = declStart;
		while (i < offset) {
			const ch = text[i];
			if (inCode(state)) {
				if (braceOpen === -1 && state.depth === 0) {
					if (ch === '=') eqSeen = true;
					else if (eqSeen && ch === '{') braceOpen = i;
				} else if (braceOpen !== -1 && ch === '}' && state.depth === 1) {
					return undefined; // the meta object closed before the cursor
				}
			}
			i += step(text, i, state);
		}
		// Complete only in plain code at the top level of the meta object.
		if (braceOpen === -1 || !inCode(state) || state.depth !== 1) return undefined;

		// Mask everything that isn't top-level code (nested objects, strings,
		// comments), then collect the fields already present so they aren't
		// suggested again. Newlines are kept so the key regex stays line-anchored.
		const mask: ScanState = { depth: 0, quote: '', escaped: false, comment: '' };
		let topLevel = '';
		let j = braceOpen;
		while (j < text.length) {
			const wasTopLevelCode = mask.depth === 1 && inCode(mask);
			const consumed = step(text, j, mask);
			if (mask.depth === 0 && j > braceOpen) break; // object end
			for (let k = j; k < j + consumed; k++) {
				topLevel += text[k] === '\n' ? '\n' : wasTopLevelCode ? text[k] : ' ';
			}
			j += consumed;
		}
		const present = new Set(
			Array.from(topLevel.matchAll(/^[ \t]*(\w+)\s*:/gm), (match) => match[1]),
		);

		return META_FIELDS.filter((field) => !present.has(field.label)).map((field) => {
			const item = new vscode.CompletionItem(
				field.label,
				vscode.CompletionItemKind.Property,
			);
			item.detail = field.detail;
			item.documentation = new vscode.MarkdownString(field.documentation);
			item.insertText = `${field.label}: `;
			// Rank above the language server's generic TS suggestions ('!' sorts
			// before '$', so sdocs fields beat runes and global identifiers).
			item.sortText = `!${field.label}`;
			return item;
		});
	}
}
