import * as vscode from 'vscode';

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

	const template = `<script${lang}>
	import ${componentName} from './${fileName}';
</script>

[DOCS title="${componentName}" description=""]

	[preview component={${componentName}}]
		<${componentName} {...args} />
	[/preview]

[/DOCS]
`;

	await vscode.workspace.fs.writeFile(sdocUri, new TextEncoder().encode(template));
	const doc = await vscode.window.showTextDocument(sdocUri);
	// Put the cursor in the description value, ready to type.
	const offset = template.indexOf('description="') + 'description="'.length;
	const position = doc.document.positionAt(offset);
	doc.selection = new vscode.Selection(position, position);
}
