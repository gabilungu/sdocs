/**
 * CLI end-to-end tests. These spawn the real bin against real projects:
 *
 * - A bare project with no local install (the `npx sdocs` shape): the dev
 *   server must boot and the staged Explorer's shiki import must resolve —
 *   the staging directory links sdocs' own dependencies into place.
 * - `sdocs build` in the standalone test app: the emitted preview pages
 *   must exist under the entity identities the plugin generates — the
 *   byte-match invariant between app-gen's precomputed inputs and the
 *   plugin's virtual ids.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BIN = resolve(__dirname, '../../bin/sdocs.js');
const REPO = resolve(__dirname, '../../../..');

const children: ChildProcess[] = [];
const tempDirs: string[] = [];

// The CLI runs from dist/ (bin/sdocs.js imports ../dist/server/cli.js), so
// build before spawning it — the Testing panel and fresh checkouts have no
// dist yet.
beforeAll(() => {
	execFileSync('npm', ['run', 'build'], { cwd: resolve(__dirname, '../..'), stdio: 'ignore' });
}, 120_000);

afterAll(() => {
	for (const child of children) child.kill('SIGINT');
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeBareProject(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-e2e-')));
	tempDirs.push(dir);
	mkdirSync(join(dir, 'src'), { recursive: true });
	// A node_modules dir pins the staging directory inside the project —
	// the layout that reproduces the npx regression.
	mkdirSync(join(dir, 'node_modules'));
	writeFileSync(join(dir, 'package.json'), '{"name":"bare","type":"module"}\n');
	writeFileSync(
		join(dir, 'src/Thing.svelte'),
		'<script>\n\tlet { label = "hi" } = $props();\n</script>\n<button>{label}</button>\n',
	);
	writeFileSync(
		join(dir, 'src/Thing.sdoc'),
		'<script>\n\timport Thing from "./Thing.svelte";\n</script>\n\n[SHOWCASE title="Thing"]\n\n\t[preview component={Thing} args={{ label: \'hi\' }}]\n\t\t<Thing {...args} />\n\t[/preview]\n\n[/SHOWCASE]\n',
	);
	return dir;
}

function spawnCli(args: string[], cwd: string): { child: ChildProcess; output: () => string } {
	let buffer = '';
	const child = spawn('node', [BIN, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
	child.stdout!.on('data', (d) => (buffer += d));
	child.stderr!.on('data', (d) => (buffer += d));
	children.push(child);
	// eslint-disable-next-line no-control-regex — CI runners colorize output
	return { child, output: () => buffer.replace(/\x1b\[[0-9;]*m/g, '') };
}

async function waitFor<T>(
	fn: () => T | null | Promise<T | null>,
	timeoutMs: number,
	what: string,
): Promise<T> {
	const start = Date.now();
	for (;;) {
		const value = await fn();
		if (value) return value;
		if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
		await new Promise((r) => setTimeout(r, 300));
	}
}

describe('sdocs dev in a bare project (npx shape)', () => {
	it('boots and serves the staged Explorer with its shiki import resolving', { timeout: 150_000 }, async () => {
		const dir = makeBareProject();
		const { output } = spawnCli(['dev'], dir);

		const url = await waitFor(
			() => output().match(/http:\/\/localhost:\d+/)?.[0] ?? null,
			120_000,
			'dev server URL',
		).catch((err) => {
			throw new Error(`${err.message}\nCLI output:\n${output().slice(-3000)}`);
		});

		// The app shell must serve
		const page = await waitFor(
			async () => {
				try {
					const res = await fetch(url);
					return res.ok ? await res.text() : null;
				} catch {
					return null;
				}
			},
			30_000,
			'index page',
		);
		expect(page).toContain('entry.js');

		// The staged highlighter module must transform (the npx regression:
		// its `shiki/core` import failed to resolve from the staging dir)
		const staging = readdirSync(join(dir, 'node_modules/.cache')).find((d) =>
			d.startsWith('sdocs-'),
		);
		expect(staging, 'staging dir created inside the project').toBeTruthy();
		const highlighterUrl = `${url}/@fs${join(dir, 'node_modules/.cache', staging!, 'explorer/highlighter.js')}`;
		const res = await fetch(highlighterUrl);
		expect(res.status, 'highlighter transform').toBe(200);
		expect(output()).not.toContain('Failed to resolve');
	});
});

describe('sdocs build in the standalone test app', () => {
	it('emits preview pages keyed by entity identity (byte-match invariant)', { timeout: 120_000 }, async () => {
		// Copy the app so build output never pollutes the repo
		const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-build-')));
		tempDirs.push(dir);
		cpSync(join(REPO, 'apps/testapp-standalone'), dir, { recursive: true });
		rmSync(join(dir, 'dist'), { recursive: true, force: true });
		// The app's deps are hoisted to the monorepo root; the copy needs them
		mkdirSync(join(dir, 'node_modules'), { recursive: true });
		for (const dep of ['clsx', 'svelte']) {
			symlinkSync(join(REPO, 'node_modules', dep), join(dir, 'node_modules', dep), 'junction');
		}

		const { child, output } = spawnCli(['build'], dir);
		await new Promise<void>((resolvePromise, reject) => {
			child.on('exit', (code) =>
				code === 0 ? resolvePromise() : reject(new Error(`build exited ${code}:\n${output().slice(-2000)}`)),
			);
		});

		const previews = join(dir, 'dist/previews');
		const entityDirs = readdirSync(previews).filter((d) => d !== '_css');
		expect(entityDirs.length).toBeGreaterThanOrEqual(2);

		// Decode the base64url entity tokens: every one must be relPath#slug
		const decoded = entityDirs.map((d) => Buffer.from(d, 'base64url').toString('utf8'));
		for (const id of decoded) {
			expect(id, `entity id ${id}`).toMatch(/\.sdoc#[\w-]+$/);
		}
		expect(decoded.some((id) => id.endsWith('Chip.sdoc#chip'))).toBe(true);
		expect(decoded.some((id) => id.endsWith('About.sdoc#pages-about'))).toBe(true);

		// Every entity dir holds built preview pages wired to the bundle
		const { readFileSync } = await import('node:fs');
		for (const entityDir of entityDirs) {
			const files = readdirSync(join(previews, entityDir));
			const html = files.filter((f) => f.endsWith('.html'));
			expect(html.length).toBeGreaterThanOrEqual(1);
			for (const file of html) {
				const content = readFileSync(join(previews, entityDir, file), 'utf8');
				expect(content, `${entityDir}/${file} references built assets`).toMatch(
					/type="module"|\/assets\//,
				);
			}
		}

		// Route pages are prerendered: real content in the app target and a
		// per-route <title>, ready for hydration — not a bare SPA shell.
		const aboutPage = readFileSync(join(dir, 'dist/pages/about/index.html'), 'utf8');
		expect(aboutPage).toContain('<title>Pages / About – ');
		expect(aboutPage).toContain('<div id="app"><!--');
		expect(aboutPage, 'DOC prose is prerendered').toContain('without installing it');
		const chipPage = readFileSync(join(dir, 'dist/chip/index.html'), 'utf8');
		expect(chipPage).toContain('<title>Chip – ');
		expect(chipPage, 'showcase description becomes the meta description').toContain(
			'<meta name="description" content="A pill-shaped tag',
		);
		// The 404 fallback stays a bare shell (unknown routes boot the SPA).
		const notFound = readFileSync(join(dir, 'dist/404.html'), 'utf8');
		expect(notFound).toMatch(/<div id="app">\s*<\/div>/);
	});
});
