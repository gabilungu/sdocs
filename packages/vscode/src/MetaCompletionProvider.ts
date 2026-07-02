import * as vscode from 'vscode';
import { findMetaObject, importedIdentifiers, inCode, newScanState, step } from './sdocSource';

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

export class MetaCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] | undefined {
		const text = document.getText();
		const offset = document.offsetAt(position);

		const meta = findMetaObject(text, offset);
		if (!meta || meta.braceOpen >= offset || offset > meta.objEnd) return undefined;

		// Complete only in plain code at the top level of the meta object.
		const state = newScanState();
		let i = meta.braceOpen;
		while (i < offset) i += step(text, i, state);
		if (!inCode(state) || state.depth !== 1) return undefined;

		// Classify the position from the masked object text: what precedes the
		// word being typed?
		const before = meta.topLevel.slice(0, offset - meta.braceOpen);
		const tail = before.replace(/[\w$]*$/, '').trimEnd();

		// Value position after `component:` → suggest imported identifiers.
		if (/component\s*:$/.test(tail)) {
			return [...importedIdentifiers(text)].map((name) => {
				const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
				item.detail = 'imported in this file';
				item.sortText = `!${name}`;
				return item;
			});
		}

		// Other value positions belong to the language server.
		if (!tail.endsWith('{') && !tail.endsWith(',')) return undefined;

		const present = new Set(
			Array.from(meta.topLevel.matchAll(/^[ \t]*(\w+)\s*:/gm), (match) => match[1]),
		);
		return META_FIELDS.filter((field) => !present.has(field.label)).map((field) => {
			const item = new vscode.CompletionItem(
				field.label,
				vscode.CompletionItemKind.Property,
			);
			item.detail = field.detail;
			item.documentation = new vscode.MarkdownString(field.documentation);
			item.insertText = `${field.label}: `;
			item.sortText = `!${field.label}`;
			return item;
		});
	}
}
