import * as vscode from 'vscode';
import { sectionPrefixOf } from './section-prefix.js';

/** Scaffold `X.sdoc` next to `X.svelte` and open it. */
export async function newComponentDoc(uri?: vscode.Uri): Promise<void> {
	const target = uri ?? vscode.window.activeTextEditor?.document.uri;
	if (!target || !target.fsPath.endsWith('.svelte')) {
		vscode.window.showErrorMessage('sdocs: select a .svelte file to document.');
		return;
	}

	const sdocUri = target.with({ path: target.path.replace(/\.svelte$/, '.sdoc') });
	try {
		await vscode.workspace.fs.stat(sdocUri);
		// Already documented — just open it.
		await vscode.window.showTextDocument(sdocUri);
		return;
	} catch {
		// Doesn't exist yet — create it.
	}

	const fileName = target.path.split('/').pop()!;
	const componentName = fileName.replace(/\.svelte$/, '').replace(/[^\w$]/g, '');
	const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
	const lang = /<script[^>]*\slang=["']ts["']/.test(source) ? ' lang="ts"' : '';
	const section = await neighbouringSection(target);

	const template = `<script${lang}>
	import ${componentName} from './${fileName}';
</script>

[SHOWCASE title="${section}${componentName}" description=""]

	[COMPONENT component={${componentName}}]
		<${componentName} {...args} />
	[/COMPONENT]

[/SHOWCASE]
`;

	await vscode.workspace.fs.writeFile(sdocUri, new TextEncoder().encode(template));
	const doc = await vscode.window.showTextDocument(sdocUri);
	// Put the cursor in the description value, ready to type.
	const offset = template.indexOf('description="') + 'description="'.length;
	const position = doc.document.positionAt(offset);
	doc.selection = new vscode.Selection(position, position);
}

/**
 * The `@section/` prefix the new doc should carry, or '' for none.
 *
 * On a site that declares sections, a title without a prefix belongs to no
 * declared section — which is a site-structure error, and those render
 * full-page over the whole Explorer. So the command whose job is to get you
 * started took the site down until you noticed the missing prefix.
 *
 * The neighbours are the evidence: components in one folder are documented
 * into one section essentially always, and if there are no `.sdoc` files
 * beside this one there is nothing to disagree with — a bare title is right
 * when no sections are declared, which is also the default.
 */
async function neighbouringSection(target: vscode.Uri): Promise<string> {
	const dir = target.with({ path: target.path.replace(/\/[^/]+$/, '') });
	let entries: [string, vscode.FileType][];
	try {
		entries = await vscode.workspace.fs.readDirectory(dir);
	} catch {
		return '';
	}
	const texts: string[] = [];
	for (const [name, type] of entries) {
		if (type !== vscode.FileType.File || !name.endsWith('.sdoc')) continue;
		try {
			texts.push(
				new TextDecoder().decode(
					await vscode.workspace.fs.readFile(target.with({ path: `${dir.path}/${name}` })),
				),
			);
		} catch {
			// Unreadable neighbour: it just doesn't get a vote.
		}
	}
	return sectionPrefixOf(texts);
}
