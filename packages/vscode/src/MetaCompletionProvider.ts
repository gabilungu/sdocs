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

export class MetaCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] | undefined {
		// Only trigger inside meta = { ... } blocks
		const textBefore = document.getText(
			new vscode.Range(new vscode.Position(0, 0), position),
		);

		// Check we're inside an `export const meta = { }` block
		const metaStart = textBefore.lastIndexOf('export const meta');
		if (metaStart === -1) return undefined;

		const afterMeta = textBefore.slice(metaStart);
		const braceOpen = afterMeta.indexOf('{');
		if (braceOpen === -1) return undefined;

		// Count braces to ensure we're inside the object
		const insideMeta = afterMeta.slice(braceOpen);
		let depth = 0;
		for (const ch of insideMeta) {
			if (ch === '{') depth++;
			if (ch === '}') depth--;
		}

		// depth > 0 means we're still inside the meta object
		if (depth <= 0) return undefined;

		// Only suggest at the top level of the meta object (depth === 1)
		if (depth !== 1) return undefined;

		return META_FIELDS.map((field) => {
			const item = new vscode.CompletionItem(
				field.label,
				vscode.CompletionItemKind.Property,
			);
			item.detail = field.detail;
			item.documentation = new vscode.MarkdownString(field.documentation);
			return item;
		});
	}
}
