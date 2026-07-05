import * as vscode from 'vscode';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { configSchema, type ConfigFieldSchema } from 'sdocs/language';
import { scanContext, objectAt, valuePosition } from './configCompletionCore';

/**
 * Key and value completion for `sdocs.config.*`.
 *
 * This is a fallback for projects that don't install `sdocs`: when the package
 * IS resolvable, the config's `/** @type {import('sdocs').SdocsConfig} *\/`
 * annotation lets the TypeScript server drive completion from the real type
 * (which also type-checks), so this provider steps aside and stays silent.
 * When `sdocs` isn't installed, it fills the gap from the bundled schema.
 */
export class ConfigCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		doc: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] | undefined {
		if (sdocsResolvable(doc.uri.fsPath)) return undefined;

		const ctx = scanContext(doc.getText(), doc.offsetAt(position));
		if (!ctx) return undefined;

		const fields = objectAt(configSchema, ctx.path);
		if (!fields) return undefined;

		const linePrefix = doc.lineAt(position).text.slice(0, position.character);

		if (ctx.valueKey) {
			const field = fields[ctx.valueKey];
			const value = valuePosition(linePrefix);
			if (field?.values && value) {
				return field.values.map((v) => valueItem(v, field, value.inString));
			}
			return undefined;
		}

		return Object.entries(fields)
			.filter(([name]) => !ctx.siblings.includes(name))
			.map(([name, field]) => keyItem(name, field));
	}
}

function keyItem(name: string, field: ConfigFieldSchema): vscode.CompletionItem {
	const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
	item.detail = field.detail;
	item.documentation = new vscode.MarkdownString(field.doc);
	item.insertText = new vscode.SnippetString(name + field.insert);
	item.sortText = `0_${name}`; // above the JS server's generic suggestions
	return item;
}

function valueItem(value: string, field: ConfigFieldSchema, inString: boolean): vscode.CompletionItem {
	const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
	item.documentation = new vscode.MarkdownString(field.doc);
	item.insertText = field.quoted && !inString ? `'${value}'` : value;
	item.sortText = `0_${value}`;
	return item;
}

/** Whether `sdocs` is resolvable from the config file's directory (walks up). */
function sdocsResolvable(fsPath: string): boolean {
	try {
		const require = createRequire(path.join(path.dirname(fsPath), 'noop.js'));
		require.resolve('sdocs/package.json');
		return true;
	} catch {
		return false;
	}
}
