/**
 * Live integration test: boots a REAL VS Code with this extension loaded,
 * opens a project's .sdoc, and requests completions the way the editor
 * does. This exercises the layers the headless LSP tests bypass —
 * vscode-languageclient wiring, provider merging, trigger behavior.
 *
 * Run: npm run test:live   (downloads VS Code on first run; not part of CI)
 */

const { runTests } = require('@vscode/test-electron');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const BUTTON_SVELTE = `<script lang="ts">
	interface Props {
		label: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		intent?: 'default' | 'danger';
		disabled?: boolean;
	}
	let { label, size = 'md', intent = 'default', disabled = false }: Props = $props();
</script>

<button data-size={size} data-intent={intent} {disabled}>{label}</button>
`;

const BUTTON_SDOC = `<script lang="ts">
	import Button from "./Button.svelte";
</script>

[DOCS title="Button" description=""]

	[preview component={Button} args={{ label: "Login" }}]
		<Button {...args} />
	[/preview]

	[example title="Sizes"]
		<Button size="xs" label="Extra small" />
		<Button size="lg" label="Large" />
	[/example]

[/DOCS]
`;

async function main() {
	// If this env var leaks in (some CLI harnesses set it), the spawned
	// VS Code runs as plain Node and tries to require() the workspace path.
	delete process.env.ELECTRON_RUN_AS_NODE;

	const extensionDevelopmentPath = resolve(__dirname, '../..');

	// Fresh build of the extension + server
	execFileSync('node', ['esbuild.js'], { cwd: extensionDevelopmentPath, stdio: 'inherit' });

	// A disposable project with a typed component
	const repo = resolve(extensionDevelopmentPath, '../..');
	const workspace = mkdtempSync(join(tmpdir(), 'sdocs-live-'));
	mkdirSync(join(workspace, 'src/lib/Button'), { recursive: true });
	writeFileSync(join(workspace, 'src/lib/Button/Button.svelte'), BUTTON_SVELTE);
	writeFileSync(join(workspace, 'src/lib/Button/Button.sdoc'), BUTTON_SDOC);
	writeFileSync(
		join(workspace, 'package.json'),
		'{"name":"live-fixture","private":true,"type":"module"}\n',
	);
	writeFileSync(
		join(workspace, 'tsconfig.json'),
		'{"compilerOptions":{"strict":true,"module":"esnext","moduleResolution":"bundler","target":"esnext","skipLibCheck":true},"include":["src/**/*"]}\n',
	);
	mkdirSync(join(workspace, 'node_modules'), { recursive: true });
	symlinkSync(join(repo, 'node_modules/svelte'), join(workspace, 'node_modules/svelte'), 'junction');

	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath: resolve(__dirname, 'suite.cjs'),
		launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust'],
	});
}

main().catch((err) => {
	console.error('INTEGRATION TEST FAILED:', err.message ?? err);
	process.exit(1);
});
