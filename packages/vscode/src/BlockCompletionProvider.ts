import * as vscode from 'vscode';
import { scanSdoc, attributeRules, type AttrRule } from 'sdocs/language';
import { importedIdentifiers } from './sdocSource';

interface BlockSpec {
	label: string;
	detail: string;
	/** Snippet for the whole block, starting right after the typed '[' */
	insert: string;
}

const ENTITY_BLOCKS: BlockSpec[] = [
	{
		label: 'SHOWCASE',
		detail: 'Component docs: live component blocks with controls + examples',
		insert: 'SHOWCASE title="$1"]\n\n\t$0\n\n[/SHOWCASE]',
	},
	{
		label: 'DOC',
		detail: 'Freeform markdown page',
		insert: 'DOC title="$1"]\n\n\t$0\n\n[/DOC]',
	},
	{
		label: 'PAGE',
		detail: 'Svelte page in the docs app (landing pages, custom routes)',
		insert: 'PAGE title="$1"]\n\n\t$0\n\n[/PAGE]',
	},
	{
		label: 'LAYOUT',
		detail: 'Full-page sketch on an isolated stage',
		insert: 'LAYOUT title="$1"]\n\n\t$0\n\n[/LAYOUT]',
	},
];

/** Uppercase since 0.0.139 — what the formatter writes, so what completion
 * offers. Lowercase still parses; nothing here needs to offer it. */
const SUB_BLOCKS: BlockSpec[] = [
	{
		label: 'COMPONENT',
		detail: 'Live showcase with interactive controls',
		insert: 'COMPONENT component={$1}]\n\t$0\n[/COMPONENT]',
	},
	{
		label: 'COMPONENTS',
		detail: 'Groups several [COMPONENT] blocks into one tab strip',
		insert: 'COMPONENTS]\n\t$0\n[/COMPONENTS]',
	},
	{
		label: 'EXAMPLE',
		detail: 'Frozen showcase, rendered exactly as written',
		insert: 'EXAMPLE title="$1"]\n\t$0\n[/EXAMPLE]',
	},
	{
		label: 'NOTES',
		detail: 'Standing remarks — one per line, optionally typed',
		insert: 'NOTES]\n\t- ${1|bug,a11y,warning,perf,tip,info|}: $0\n[/NOTES]',
	},
	{
		label: 'TODO',
		detail: 'A nested checklist, tickable from the Explorer in dev',
		insert: 'TODO]\n\t- [ ] $0\n[/TODO]',
	},
	{
		label: 'PROSE',
		detail: 'Markdown between the blocks — the capabilities of a [DOC] body',
		insert: 'PROSE]\n\t$0\n[/PROSE]',
	},
];

/** What each entity takes. A [DOC] body is already prose, so it takes neither
 * [PROSE] nor the component blocks; a [LAYOUT] and a [PAGE] take none of them
 * yet — their bodies capture no blocks. */
const SUB_BLOCKS_BY_ENTITY: Record<string, string[]> = {
	SHOWCASE: ['COMPONENT', 'COMPONENTS', 'EXAMPLE', 'NOTES', 'TODO', 'PROSE'],
	DOC: ['EXAMPLE', 'NOTES', 'TODO'],
};

/** Human descriptions for attributes, keyed by name. The set of attributes a
 * block *allows* comes from the parser (attributeRules) — the single source of
 * truth diagnostics use — so completions never drift from validation. This map
 * only enriches them; an attribute missing here still completes. */
const ATTR_SHOWCASE: Record<string, string> = {
	title: 'Sidebar path — `/` segments nest like folders. A leading `:` on the first segment makes a group header.',
	description: 'One sentence shown under the page title.',
	component: "The demonstrated component: an identifier imported in the file's `<script>`. Drives prop extraction and controls.",
	args: "This preview's control defaults — plain literals only: `args={{ label: 'Hi', disabled: false }}`.",
	maxWidth: 'Content column ([SHOWCASE]/[DOC]/[PAGE]) or stage ([LAYOUT]/[component]/[example]) width. Overrides the config default.',
	padding: 'Space around the content or stage. Overrides the entity and config defaults.',
	direction: 'Stage `flex-direction` (`row`/`column`). Overrides the entity and config defaults.',
	gap: 'Stage `gap` between items. Overrides the entity and config defaults.',
	contentX: 'Horizontal alignment of stage contents: `left` · `center` · `right` · `justify` (spread). On `[DOC]`/`[PAGE]`, places the content column instead: `left` · `center` · `right`.',
	contentY: 'Vertical alignment of stage contents: `top` · `middle` · `bottom` · `justify` (spread).',
	toc: '`toc="false"` hides the table of contents for this page.',
	slug: 'Overrides the URL segment for this entity (lowercase letters, digits, hyphens). Defaults to the slugified last title segment.',
	hide: 'Keeps this entity routable but out of every sidebar — for pages reached by link only (a home page, say).',
	code: '`code="false"` hides this example\'s code panel — for a `[DOC]` that wants the rendered thing, not its source. Shown by default.',
	tags: 'What this example shows, comma-separated: `tags="user menu, badge"`. Rendered as quiet badges, and searched by the MCP `search_docs` tool.',
	synonyms:
		'Other names this component answers to, comma-separated: `synonyms="pill, chip"`. Rendered above the preview, and searched by the MCP `search_docs` tool.',
	status:
		'Where this component sits in its life: `draft` · `wip` · `review` · `experimental` · `ready` · `deprecated`. Shown as a glyph on the component\'s tab. Optional — no status reads as "nobody said". A `[NOTES]` line is the place for a remark *about* the component; this is a property of it.',
};

/** Snippet body for an attribute, from its value kind. The two expression
 * attributes get their shape spelled out: `={$1}` on its own leaves the author
 * facing an empty pair of braces with no clue what belongs in them. */
function attrInsert(name: string, rule: AttrRule): string {
	if (name === 'args') return 'args={{ $1 }}';
	// The six are a closed set, so offer them rather than an empty pair of quotes.
	if (name === 'status') return 'status="${1|draft,wip,review,experimental,ready,deprecated|}"';
	if (rule.kind === 'bare') return name;
	return rule.kind === 'expression' ? `${name}={$1}` : `${name}="$1"`;
}

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
		// depends on the entity the cursor sits inside: [SHOWCASE] takes both
		// sub-blocks, [DOC] takes [example] only, elsewhere entities.
		const bare = /^\s*\[([A-Za-z]*)$/.exec(before);
		if (bare) {
			const file = scanSdoc(document.getText());
			const offset = document.offsetAt(position);
			const host = file.entities.find(
				(e) => offset > e.openerSpan.end && offset < e.span.end,
			);
			const allowed = host ? SUB_BLOCKS_BY_ENTITY[host.kind] : undefined;
			const specs = allowed
				? SUB_BLOCKS.filter((s) => allowed.includes(s.label))
				: host
					? []
					: ENTITY_BLOCKS;
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
		const opener = /^\s*\[(SHOWCASE|DOC|PAGE|LAYOUT|COMPONENT|EXAMPLE|component|example)\b/.exec(line);
		if (!opener) return undefined;
		const rules = attributeRules(opener[1]);
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
		return Object.entries(rules)
			.filter(([name]) => !present.has(name))
			.map(([name, rule]) => {
				const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
				item.detail = rule.required ? `${rule.hint} (required)` : rule.hint;
				if (ATTR_SHOWCASE[name]) item.documentation = new vscode.MarkdownString(ATTR_SHOWCASE[name]);
				item.insertText = new vscode.SnippetString(attrInsert(name, rule));
				// required first, then a stable order matching the rules
				item.sortText = `${rule.required ? '0' : '1'}${name}`;
				return item;
			});
	}
}
