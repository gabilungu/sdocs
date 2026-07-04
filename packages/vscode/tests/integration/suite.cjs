/** Runs inside the VS Code extension host (see main.cjs). */

const vscode = require('vscode');
const assert = require('node:assert');
const { join } = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUntil(fn, timeoutMs, what) {
	const start = Date.now();
	for (;;) {
		const value = await fn();
		if (value) return value;
		if (Date.now() - start > timeoutMs) throw new Error(`Timed out: ${what}`);
		await sleep(500);
	}
}

exports.run = async function run() {
	const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
	const file = vscode.Uri.file(join(workspace, 'src/lib/Button/Button.sdoc'));

	const doc = await vscode.workspace.openTextDocument(file);
	assert.strictEqual(doc.languageId, 'sdoc', `languageId is ${doc.languageId}, expected sdoc`);
	const editor = await vscode.window.showTextDocument(doc);

	// Type a partial component tag inside the Sizes example, like a user would
	const anchor = doc
		.getText()
		.split('\n')
		.findIndex((l) => l.includes('<Button size="xs"'));
	assert.ok(anchor > 0, 'found the Sizes example');
	await editor.edit((edit) => {
		edit.insert(new vscode.Position(anchor, 0), '\t\t<Button s />\n');
	});
	const position = new vscode.Position(anchor, '\t\t<Button s'.length);

	// Ask for completions the way the editor does, polling while the language
	// server warms up (project TS service takes a few seconds on first open)
	const props = await pollUntil(
		async () => {
			const list = await vscode.commands.executeCommand(
				'vscode.executeCompletionItemProvider',
				file,
				position,
			);
			const labels = (list?.items ?? []).map((i) =>
				typeof i.label === 'string' ? i.label : i.label.label,
			);
			const hits = labels.filter((l) => ['size', 'intent', 'label', 'disabled', 'type'].includes(l));
			console.log(`completion poll: ${labels.length} items, props: [${hits.join(',')}]`);
			return hits.length >= 2 ? hits : null;
		},
		60_000,
		'component props in completion list',
	);

	console.log('LIVE INTEGRATION OK — props completed in real VS Code:', props.join(', '));
};
