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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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

/**
 * A project that documents components **without sdocs installed** — the
 * standalone CLI flow. Generated rather than copied from a checked-in app, so
 * the invariant below is not hostage to a directory somebody might tidy away.
 *
 * Two things it has to keep: a **host-only dependency** (`clsx`, resolvable
 * from the project and not from sdocs) and **two entities whose slugs differ
 * from their filenames**, which is what makes the entity-identity keying
 * observable.
 */
function makeStandaloneProject(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-build-')));
	tempDirs.push(dir);
	mkdirSync(join(dir, 'src/styles'), { recursive: true });
	writeFileSync(
		join(dir, 'package.json'),
		'{"name":"standalone","private":true,"type":"module"}\n',
	);
	writeFileSync(
		join(dir, 'sdocs.config.js'),
		"export default {\n\tlogo: 'standalone',\n\tcss: './src/styles/global.css',\n};\n",
	);
	writeFileSync(join(dir, 'src/styles/global.css'), ':root { --chip-bg: #eee; }\n');
	// clsx is the point: a dependency the *project* has and sdocs does not.
	writeFileSync(
		join(dir, 'src/Chip.svelte'),
		[
			'<script>',
			"\timport clsx from 'clsx';",
			'\t/**',
			'\t * @typedef {Object} Props',
			'\t * @property {string} [label] - Chip text',
			'\t * @property {boolean} [active] - Highlighted state',
			'\t */',
			'\t/** @type {Props} */',
			"\tlet { label = 'Chip', active = false } = $props();",
			'</script>',
			"<span class={clsx('chip', active && 'is-active')}>{label}</span>",
			'',
		].join('\n'),
	);
	writeFileSync(
		join(dir, 'src/Chip.sdoc'),
		[
			'<script>',
			"\timport Chip from './Chip.svelte';",
			'</script>',
			'',
			'[SHOWCASE title="Chip" description="A chip using a host-only dependency."]',
			'',
			"\t[component component={Chip} args={{ label: 'Hello', active: false }}]",
			'\t\t<Chip {...args} />',
			'\t[/component]',
			'',
			'\t[example title="Active"]',
			'\t\t<Chip label="On" active />',
			'\t[/example]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n'),
	);
	// A grouped title, so the slug (`pages-about`) differs from the filename.
	writeFileSync(
		join(dir, 'src/About.sdoc'),
		[
			'<script>',
			"\timport Chip from './Chip.svelte';",
			'</script>',
			'',
			'[DOC title=":Pages / About"]',
			'',
			'\t# standalone',
			'',
			'\tDocumented without installing sdocs.',
			'',
			'\t[example title="Chips"]',
			'\t\t<Chip label="One" active />',
			'\t[/example]',
			'',
			'[/DOC]',
			'',
		].join('\n'),
	);
	// sdocs resolves the project's own deps; symlink them in as an install would.
	mkdirSync(join(dir, 'node_modules'), { recursive: true });
	for (const dep of ['clsx', 'svelte']) {
		symlinkSync(join(REPO, 'node_modules', dep), join(dir, 'node_modules', dep), 'junction');
	}
	return dir;
}

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
		'<script>\n\timport Thing from "./Thing.svelte";\n</script>\n\n[SHOWCASE title="Thing"]\n\n\t[component component={Thing} args={{ label: \'hi\' }}]\n\t\t<Thing {...args} />\n\t[/component]\n\n[/SHOWCASE]\n',
	);
	return dir;
}

/**
 * The real `npx sdocs` layout: sdocs sitting in a cache directory of its own,
 * from which vite is NOT reachable, run against a project where it is.
 *
 * That asymmetry is the whole bug. npm declines to install a peer into the npx
 * cache when it decides the surrounding project already satisfies it, so in any
 * project that has vite — every project likely to run this — the cache gets
 * sdocs without one. Node then resolves a bare `import 'vite'` upward from the
 * cache, never reaching the project, and the command dies on the one dependency
 * npm was sure it already had.
 *
 * sdocs' dist is COPIED rather than symlinked on purpose: Node resolves through
 * symlinks to the real path, so a linked package would walk up from the repo
 * and find the repo's vite, quietly testing nothing.
 */
function makeNpxShape(): { projectDir: string; bin: string } {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'sdocs-npx-')));
	tempDirs.push(root);

	const pkgRoot = resolve(__dirname, '../..');
	const cached = join(root, 'cache', 'node_modules', 'sdocs');
	mkdirSync(cached, { recursive: true });
	cpSync(join(pkgRoot, 'dist'), join(cached, 'dist'), { recursive: true });
	cpSync(join(pkgRoot, 'bin'), join(cached, 'bin'), { recursive: true });
	cpSync(join(pkgRoot, 'package.json'), join(cached, 'package.json'));

	// Its runtime dependencies, linked beside it the way npm would install them.
	// Only these — vite, svelte and the plugin are peers, and their absence here
	// is the condition under test.
	//
	// Located on disk rather than through require.resolve: a package is free to
	// leave './package.json' out of its exports map (esm-env does), and this
	// needs the directory, not an entry point.
	const depDir = (name: string): string => {
		for (const base of [pkgRoot, REPO]) {
			const candidate = join(base, 'node_modules', ...name.split('/'));
			if (existsSync(candidate)) return candidate;
		}
		throw new Error(`cannot locate ${name} to build the npx-shape fixture`);
	};
	for (const dep of Object.keys(
		JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).dependencies ?? {},
	)) {
		symlinkSync(depDir(dep), join(root, 'cache', 'node_modules', dep), 'dir');
	}

	// The project: has vite (and svelte), as any real Svelte project does.
	const projectDir = join(root, 'project');
	mkdirSync(join(projectDir, 'node_modules'), { recursive: true });
	mkdirSync(join(projectDir, 'src'), { recursive: true });
	writeFileSync(join(projectDir, 'package.json'), '{"name":"host","type":"module"}\n');
	for (const dep of ['vite', 'svelte', '@sveltejs/vite-plugin-svelte']) {
		const to = join(projectDir, 'node_modules', ...dep.split('/'));
		mkdirSync(dirname(to), { recursive: true });
		symlinkSync(depDir(dep), to, 'dir');
	}
	writeFileSync(
		join(projectDir, 'src/Thing.svelte'),
		'<script>\n\tlet { label = "hi" } = $props();\n</script>\n<button>{label}</button>\n',
	);
	writeFileSync(
		join(projectDir, 'src/Thing.sdoc'),
		'<script>\n\timport Thing from "./Thing.svelte";\n</script>\n\n[SHOWCASE title="Thing"]\n\n\t[component component={Thing} args={{ label: \'hi\' }}]\n\t\t<Thing {...args} />\n\t[/component]\n\n[/SHOWCASE]\n',
	);

	return { projectDir, bin: join(cached, 'bin/sdocs.js') };
}

function spawnCli(args: string[], cwd: string, bin = BIN): { child: ChildProcess; output: () => string } {
	let buffer = '';
	const child = spawn('node', [bin, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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

describe('the note endpoint', () => {
	it(
		'writes a note into the project source, and refuses a file it does not document',
		{ timeout: 150_000 },
		async () => {
			// The one route in sdocs that writes to a user's files. It exists
			// only on the dev server, and only for files this project already
			// documents — a path off the wire must never reach the disk.
			const dir = makeBareProject();
			const { output } = spawnCli(['dev'], dir);
			const url = await waitFor(
				() => output().match(/http:\/\/localhost:\d+/)?.[0] ?? null,
				120_000,
				'dev server URL',
			);
			const post = (body: unknown) =>
				fetch(`${url}/__sdocs/notes`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});

			const doc = join(dir, 'src/Thing.sdoc');
			const before = readFileSync(doc, 'utf-8');

			const ok = await waitFor(
				async () => {
					try {
						const res = await post({
							file: doc,
							entitySlug: 'thing',
							notes: [{ note: 'Set from the Explorer.', type: 'warning' }],
						});
						return res.status === 200 ? res : null;
					} catch {
						return null;
					}
				},
				30_000,
				'note write',
			);
			expect(ok.status).toBe(200);
			const after = readFileSync(doc, 'utf-8');
			// A [NOTES] block, opened under the entity's opener.
			expect(after).toContain('\t[NOTES]');
			expect(after).toContain('\t\t- warning: Set from the Explorer.');
			expect(after).toContain('\t[/NOTES]');
			expect(after).not.toBe(before);

			// A file outside the project is refused before anything is read.
			const outside = join(dir, 'src/Secret.sdoc');
			writeFileSync(outside, '[DOC title="Secret"]\n\thi\n[/DOC]\n');
			const refused = await post({ file: outside, entitySlug: 'secret', notes: [] });
			expect(refused.status).toBe(400);
			expect(readFileSync(outside, 'utf-8')).toContain('[DOC title="Secret"]');

			// And a GET is not a way in.
			expect((await fetch(`${url}/__sdocs/notes`)).status).toBe(405);
		},
	);
});

describe('the missing-asset guard', () => {
	it("404s a missing file but still serves the Explorer's own fonts", { timeout: 150_000 }, async () => {
		// Both halves matter, and the second is why this test exists: the guard
		// shipped checking only the public directory, so every font the Explorer
		// serves from the Vite root 404'd and the whole UI fell back to a system
		// face. A rule that answers "not found" has to know everywhere a file
		// can legitimately be found.
		const dir = makeBareProject();
		const { output } = spawnCli(['dev'], dir);
		const url = await waitFor(
			() => output().match(/http:\/\/localhost:\d+/)?.[0] ?? null,
			120_000,
			'dev server URL',
		);

		const missing = await waitFor(
			async () => {
				try {
					return await fetch(`${url}/fonts/nope.woff2`);
				} catch {
					return null;
				}
			},
			30_000,
			'missing asset response',
		);
		expect(missing.status, 'a missing asset must not answer with the app shell').toBe(404);
		expect(missing.headers.get('content-type')).not.toContain('text/html');

		const font = await fetch(`${url}/ui/styles/fonts/figtree-latin.woff2`);
		expect(font.status, "the Explorer's own font must still serve").toBe(200);
	});
});

describe('sdocs dev from an npx cache, against a project that has vite', () => {
	it('finds the project’s vite instead of dying on a missing one', { timeout: 150_000 }, async () => {
		const { projectDir, bin } = makeNpxShape();
		const { output } = spawnCli(['dev'], projectDir, bin);

		const url = await waitFor(
			() => {
				// The failure this pins — `Cannot find package 'vite' imported from
				// <npx cache>/node_modules/sdocs/dist/commands/dev.js` — happens
				// before the server starts, so waiting out the timeout for a URL
				// that can never arrive just makes a regression slow to report.
				const out = output();
				if (out.includes('ERR_MODULE_NOT_FOUND')) {
					throw new Error(`sdocs could not resolve a peer from the npx cache:\n${out.slice(-2000)}`);
				}
				return out.match(/http:\/\/localhost:\d+/)?.[0] ?? null;
			},
			120_000,
			'dev server URL',
		).catch((err) => {
			throw new Error(`${err.message}\nCLI output:\n${output().slice(-3000)}`);
		});

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
	});
});

describe('sdocs build in the standalone test app', () => {
	it('emits preview pages keyed by entity identity (byte-match invariant)', { timeout: 120_000 }, async () => {
		const dir = makeStandaloneProject();

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
		// Grouped titles drop the group in the page/tab title — the sidebar carries it.
		expect(aboutPage).toContain('<title>About – ');
		expect(aboutPage).toContain('<div id="app"><!--');
		expect(aboutPage, 'DOC prose is prerendered').toContain('Documented without installing sdocs');
		const chipPage = readFileSync(join(dir, 'dist/chip/index.html'), 'utf8');
		expect(chipPage).toContain('<title>Chip – ');
		expect(chipPage, 'showcase description becomes the meta description').toContain(
			'<meta name="description" content="A chip using a host-only dependency',
		);
		// The 404 fallback stays a bare shell (unknown routes boot the SPA).
		const notFound = readFileSync(join(dir, 'dist/404.html'), 'utf8');
		expect(notFound).toMatch(/<div id="app">\s*<\/div>/);

		// The halves have to agree. Emitting well-formed tokens and prerendering
		// real pages are each necessary and neither is sufficient: the build runs
		// two Vite passes, and when only one knew the project root the prerendered
		// pages pointed at `../../../src/…` tokens while the client wrote `src/…`
		// ones — every stage on a built site loaded the host's 404 page instead of
		// the component, with nothing failing anywhere in the build.
		const htmlFiles: string[] = [];
		const walk = (d: string) => {
			for (const entry of readdirSync(d, { withFileTypes: true })) {
				const full = join(d, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith('.html')) htmlFiles.push(full);
			}
		};
		walk(join(dir, 'dist'));
		const referenced = new Set<string>();
		for (const file of htmlFiles) {
			for (const [, token] of readFileSync(file, 'utf8').matchAll(/previews\/([A-Za-z0-9_-]+)/g)) {
				referenced.add(token);
			}
		}
		expect(referenced.size, 'prerendered pages reference previews').toBeGreaterThan(0);
		const emitted = new Set(entityDirs);
		const dangling = [...referenced].filter((token) => !emitted.has(token));
		expect(
			dangling.map((t) => Buffer.from(t, 'base64url').toString('utf8')),
			'every preview a built page points at was emitted',
		).toEqual([]);
	});
});
