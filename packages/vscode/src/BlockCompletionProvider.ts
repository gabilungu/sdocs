import * as vscode from 'vscode';
import { scanSdoc } from 'sdocs/language';
import { importedIdentifiers } from './sdocSource';

interface BlockSpec {
	label: string;
	detail: string;
	/** Snippet for the whole block, starting right after the typed '[' */
	insert: string;
}

const ENTITY_BLOCKS: BlockSpec[] = [
	{
		label: 'DOCS',
		detail: 'Component docs: previews with controls + examples',
		insert: 'DOCS title="$1"]\n\n\t$0\n\n[/DOCS]',
	},
	{
		label: 'PAGE',
		detail: 'Freeform markdown page',
		insert: 'PAGE title="$1"]\n\n\t$0\n\n[/PAGE]',
	},
	{
		label: 'LAYOUT',
		detail: 'Full-page sketch on an isolated stage',
		insert: 'LAYOUT title="$1"]\n\n\t$0\n\n[/LAYOUT]',
	},
];

const SUB_BLOCKS: BlockSpec[] = [
	{
		label: 'preview',
		detail: 'Live showcase with interactive controls',
		insert: 'preview component={$1}]\n\t$0\n[/preview]',
	},
	{
		label: 'example',
		detail: 'Frozen showcase, rendered exactly as written',
		insert: 'example title="$1"]\n\t$0\n[/example]',
	},
];

interface AttrSpec {
	label: string;
	detail: string;
	documentation: string;
	/** Snippet inserted for the attribute (tab stop inside the value) */
	insert: string;
}

const BLOCK_ATTRS: Record<string, AttrSpec[]> = {
	DOCS: [
		{
			label: 'title',
			detail: "Sidebar path (e.g. 'Forms / Button')",
			documentation: 'Names the page and places it in the sidebar — `/` segments nest like folders.',
			insert: 'title="$1"',
		},
		{
			label: 'description',
			detail: 'Short text under the page title',
			documentation: 'One sentence shown in the page header.',
			insert: 'description="$1"',
		},
	],
	PAGE: [
		{
			label: 'title',
			detail: "Sidebar path (e.g. 'Guides / Setup')",
			documentation: 'Names the page and places it in the sidebar.',
			insert: 'title="$1"',
		},
	],
	LAYOUT: [
		{
			label: 'title',
			detail: "Sidebar path (e.g. 'Patterns / Login')",
			documentation: 'Names the sketch and places it in the sidebar.',
			insert: 'title="$1"',
		},
		{
			label: 'padding',
			detail: 'Space around the sketch',
			documentation: 'Padding inside the isolated frame, e.g. `padding="48px"`.',
			insert: 'padding="$1"',
		},
	],
	preview: [
		{
			label: 'component',
			detail: 'The demonstrated component',
			documentation: "An identifier imported in the file's `<script>`. Drives prop extraction and the controls.",
			insert: 'component={$1}',
		},
		{
			label: 'args',
			detail: "This preview's control defaults",
			documentation: 'Plain literals only: `args={{ label: \'Hi\', disabled: false }}`.',
			insert: 'args={{ $1 }}',
		},
		{
			label: 'title',
			detail: 'Tab label override',
			documentation: 'Defaults to the component name; set to distinguish two previews of one component.',
			insert: 'title="$1"',
		},
	],
	example: [
		{
			label: 'title',
			detail: 'Example title (required, unique)',
			documentation: 'Any text — shown above the example and used as its address.',
			insert: 'title="$1"',
		},
	],
};

/** Completions inside sdoc block openers: attribute names per block kind,
 * and imported identifiers inside component={…}. */
export class BlockCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] | undefined {
		const line = document.lineAt(position.line).text;
		const before = line.slice(0, position.character);

		// Value position inside component={…} → suggest imported identifiers.
		if (/component=\{\s*[\w$]*$/.test(before)) {
			return [...importedIdentifiers(document.getText())].map((name) => {
				const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
				item.detail = 'imported in this file';
				item.sortText = `!${name}`;
				return item;
			});
		}

		// A bare '[' (or '[par…') at line start → offer whole blocks. Which set
		// depends on whether the cursor sits inside a [DOCS] entity.
		const bare = /^\s*\[([A-Za-z]*)$/.exec(before);
		if (bare) {
			const file = scanSdoc(document.getText());
			const offset = document.offsetAt(position);
			const inDocs = file.entities.some(
				(e) => e.kind === 'DOCS' && offset > e.openerSpan.end && offset < e.span.end,
			);
			const specs = inDocs ? SUB_BLOCKS : ENTITY_BLOCKS;
			// The editor auto-closes '[' — swallow the ']' sitting after the cursor.
			const closer = line.slice(position.character).startsWith(']');
			return specs.map((spec) => {
				const item = new vscode.CompletionItem(spec.label, vscode.CompletionItemKind.Struct);
				item.detail = spec.detail;
				item.insertText = new vscode.SnippetString(spec.insert);
				item.sortText = `!${spec.label}`;
				if (closer) {
					item.additionalTextEdits = [
						vscode.TextEdit.delete(
							new vscode.Range(position, position.translate(0, 1)),
						),
					];
				}
				return item;
			});
		}

		// Attribute names on a block opener line.
		const opener = /^\s*\[(DOCS|PAGE|LAYOUT|preview|example)\b/.exec(line);
		if (!opener) return undefined;
		const specs = BLOCK_ATTRS[opener[1]];
		const tagEnd = line.indexOf('[') + 1 + opener[1].length;
		if (position.character <= tagEnd) return undefined;

		// Stay out of attribute values: not inside "…" or {…} on this line.
		const segment = before.slice(tagEnd);
		const inString = (segment.split('"').length - 1) % 2 === 1;
		const braceDepth =
			(segment.match(/\{/g)?.length ?? 0) - (segment.match(/\}/g)?.length ?? 0);
		if (inString || braceDepth > 0) return undefined;

		const present = new Set(
			Array.from(line.matchAll(/([A-Za-z_][\w-]*)\s*=/g), (m) => m[1]),
		);
		return specs
			.filter((spec) => !present.has(spec.label))
			.map((spec) => {
				const item = new vscode.CompletionItem(
					spec.label,
					vscode.CompletionItemKind.Property,
				);
				item.detail = spec.detail;
				item.documentation = new vscode.MarkdownString(spec.documentation);
				item.insertText = new vscode.SnippetString(spec.insert);
				item.sortText = `!${spec.label}`;
				return item;
			});
	}
}
