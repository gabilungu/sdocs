/**
 * The installed-extension shape: the server bundle copied to a bare
 * directory with only its shipped runtime assets (dist/node_modules and the
 * TypeScript lib files), no repo node_modules up the tree, over the IPC
 * transport VS Code uses.
 *
 * Guards the entire class of "works in the repo, dies installed" bugs:
 * the svelte fallback crash, the missing TypeScript standard libs
 * (ts2697), and the missing svelte2tsx shims (ts2304 __sveltets_2_*).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startClient, type LspClient, REPO, DOCS } from './helpers/lsp';

const DIST = resolve(__dirname, '../dist');
const NOTICE = resolve(DOCS, 'src/ui/NoticeJs.sdoc');
const uri = 'file://' + NOTICE;

let fakeInstall: string;
let fixture: string;
let client: LspClient;

const BUTTON_SVELTE = `<script lang="ts">
	interface Props {
		label: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
	}
	let { label, size = 'md' }: Props = $props();
</script>
<button data-size={size}>{label}</button>
`;

const BUTTON_SDOC = `<script lang="ts">
	import Button from "./Button.svelte";
</script>

[SHOWCASE title="Button" description=""]

	[preview component={Button} args={{ label: "Login" }}]
		<Button {...args} />
	[/preview]

	[example title="Sizes"]
		<Button s />
	[/example]

[/SHOWCASE]
`;

beforeAll(async () => {
	fakeInstall = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-installed-')));
	copyFileSync(join(DIST, 'server.js'), join(fakeInstall, 'server.js'));
	// The shipped runtime assets, linked exactly as they sit beside the bundle
	symlinkSync(join(DIST, 'node_modules'), join(fakeInstall, 'node_modules'), 'junction');
	for (const file of readdirSync(DIST)) {
		if (/^lib\..*\.d\.ts$/.test(file) || file === 'lib.d.ts') {
			copyFileSync(join(DIST, file), join(fakeInstall, file));
		}
	}

	// A workspace WITHOUT prettier (or any dev tooling) — the shape where the
	// embedded server's runtime lookups have nothing to find but the assets
	// shipped beside the bundle. The monorepo itself has everything hoisted,
	// which is exactly how this bug class hides from repo-rooted tests.
	fixture = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-bareproj-')));
	mkdirSync(join(fixture, 'src'), { recursive: true });
	writeFileSync(join(fixture, 'package.json'), '{"name":"bare","private":true,"type":"module"}\n');
	writeFileSync(join(fixture, 'src/Button.svelte'), BUTTON_SVELTE);
	writeFileSync(join(fixture, 'src/Button.sdoc'), BUTTON_SDOC);
	mkdirSync(join(fixture, 'node_modules'), { recursive: true });
	symlinkSync(join(REPO, 'node_modules/svelte'), join(fixture, 'node_modules/svelte'), 'junction');

	client = await startClient(join(fakeInstall, 'server.js'), 'ipc', fixture);
});

afterAll(() => {
	client?.dispose();
	rmSync(fakeInstall, { recursive: true, force: true });
	rmSync(fixture, { recursive: true, force: true });
});

describe('server bundle in an installed-shaped directory', () => {
	it('starts, serves a corpus file, and settles at zero diagnostics', async () => {
		await client.openDoc(uri, readFileSync(NOTICE, 'utf-8'));
		// The first publish can precede full TS-service startup; wait for the
		// service-backed publish and require it clean. A lib-less or shim-less
		// bundle produces ts(2697)/ts(2304) errors here instead.
		const first = await client.waitForDiagnostics(uri, () => true);
		expect(first.uri).toBe(uri);

		await new Promise((r) => setTimeout(r, 15_000));
		const all = client.diagnostics.get(uri) ?? [];
		const last = all[all.length - 1];
		expect(
			last.diagnostics.map((d) => `${d.range.start.line + 1}: ${String(d.message).split('\n')[0]}`),
		).toEqual([]);
	});

	it('completes component props in a workspace without prettier', async () => {
		// Regression: the embedded server resolves prettier from disk inside
		// getCompletions (TS format settings); with none shipped beside the
		// bundle and none in the workspace, every completion request threw
		// "Cannot find module 'prettier/package.json'" → "No suggestions".
		const sdocUri = 'file://' + join(fixture, 'src/Button.sdoc');
		await client.openDoc(sdocUri, BUTTON_SDOC);
		const lines = BUTTON_SDOC.split('\n');
		const line = lines.findIndex((l) => l.includes('<Button s />'));
		const character = lines[line].indexOf('<Button s') + '<Button s'.length;
		// allow the TS service a moment on first open of this workspace
		await new Promise((r) => setTimeout(r, 5_000));
		const res = (await client.connection.sendRequest('textDocument/completion', {
			textDocument: { uri: sdocUri },
			position: { line, character },
			context: { triggerKind: 1 },
		})) as { items?: { label: string }[] } | { label: string }[] | null;
		const items = Array.isArray(res) ? res : (res?.items ?? []);
		expect(items.some((i) => i.label === 'size')).toBe(true);
	});

	it('still reports real errors at authored lines (service is alive, not silent)', async () => {
		const source = readFileSync(NOTICE, 'utf-8');
		const brokenLine = source.split('\n').findIndex((l) => l.includes('{...args}'));
		await client.changeDoc(uri, 2, source.replace('{...args}', '{...args} title={nopeVar}'));
		const publish = await client.waitForDiagnostics(uri, (p) =>
			p.diagnostics.some((d) => String(d.message).includes('nopeVar')),
		);
		const hit = publish.diagnostics.find((d) => String(d.message).includes('nopeVar'))!;
		expect(hit.range.start.line).toBe(brokenLine);
	});
});
