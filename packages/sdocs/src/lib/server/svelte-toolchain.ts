/**
 * Which Svelte compiles, and which one runs.
 *
 * sdocs declares svelte, vite and vite-plugin-svelte as peers so it uses the host
 * project's copies — but `npx sdocs` installs peers beside sdocs itself, in the npx
 * cache. Two copies then exist, and the pieces used to come from different ones: the
 * previews RAN the project's svelte (resolve.dedupe pins the browser to one runtime)
 * while sdocs' own UI was COMPILED by the copy next to sdocs.
 *
 * That split breaks silently and spectacularly whenever the two versions disagree about
 * generated-code contracts. A real example: Svelte 5.56 changed `rest_props`' exclude
 * argument from an Array to a Set, so components compiled by 5.55 threw
 * "target.exclude.has is not a function" the moment a 5.56 runtime rendered them —
 * every component page blank, with nothing in the config to explain it.
 *
 * So the rule is: ONE toolchain, the project's, for compiling AND running. We load
 * vite-plugin-svelte from the project when it has one (it binds svelte/compiler from
 * beside itself, so the compiler follows), and fall back to sdocs' own copy for
 * standalone use. When only half can be aligned, say so loudly rather than crash later.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/** A require anchored in the host project, so bare specifiers resolve from ITS tree. */
function projectRequire(cwd: string) {
	return createRequire(resolve(cwd, 'package.json'));
}

/** Version of a package as the given tree resolves it; null when it has none. */
function versionFrom(cwd: string, pkg: string): string | null {
	try {
		return projectRequire(cwd).resolve(`${pkg}/package.json`)
			? (projectRequire(cwd)(`${pkg}/package.json`).version as string)
			: null;
	} catch {
		return null;
	}
}

/** The svelte the PREVIEWS will run: the project's when it has one. */
export function projectSvelteVersion(cwd: string): string | null {
	return versionFrom(cwd, 'svelte');
}

/** The svelte sdocs itself was installed with. */
export function bundledSvelteVersion(): string | null {
	try {
		const require = createRequire(import.meta.url);
		return require('svelte/package.json').version as string;
	} catch {
		return null;
	}
}

/**
 * Prefer the project's own svelte over the copy next to sdocs when both exist
 * (e.g. running via npx): previews import the project's components, and two svelte
 * runtimes in one page don't mix.
 */
export function svelteDedupe(cwd: string): string[] {
	return projectSvelteVersion(cwd) ? ['svelte'] : [];
}

type SveltePlugin = typeof import('@sveltejs/vite-plugin-svelte').svelte;

/**
 * Importing a resolved FILE PATH skips the package's export conditions, so a CJS entry
 * (svelte/compiler is one) arrives as `{ default: exports }` with no named exports, while
 * an ESM entry arrives with its names. Take whichever shape actually carries the API.
 */
function interop<T>(mod: Record<string, unknown>, probe: keyof T): T {
	return (typeof mod[probe as string] === 'function' ? mod : (mod.default ?? mod)) as T;
}

/**
 * vite-plugin-svelte from the PROJECT when it has one — which is what makes the
 * compiler match the runtime, since the plugin binds `svelte/compiler` from beside
 * itself. Falls back to sdocs' own copy (standalone use, or a project without the
 * plugin), warning when that leaves the toolchain split.
 */
export async function loadSveltePlugin(cwd: string): Promise<SveltePlugin> {
	try {
		const entry = projectRequire(cwd).resolve('@sveltejs/vite-plugin-svelte');
		const mod = interop<{ svelte: SveltePlugin }>(await import(pathToFileURL(entry).href), 'svelte');
		return mod.svelte;
	} catch {
		warnIfToolchainSplit(cwd);
		const mod = await import('@sveltejs/vite-plugin-svelte');
		return mod.svelte;
	}
}

/** `svelte/compiler` from the project when it has one, for the same reason. */
export async function loadSvelteCompiler(cwd: string): Promise<typeof import('svelte/compiler')> {
	try {
		const entry = projectRequire(cwd).resolve('svelte/compiler');
		return interop<typeof import('svelte/compiler')>(
			await import(pathToFileURL(entry).href),
			'compile'
		);
	} catch {
		return await import('svelte/compiler');
	}
}

/** A package's own manifest, read from the project's tree. */
function packageManifest(cwd: string, pkg: string): Record<string, unknown> | null {
	const req = projectRequire(cwd);
	try {
		return JSON.parse(readFileSync(req.resolve(`${pkg}/package.json`), 'utf8'));
	} catch {
		// Not exported (see packageRoot in app-gen) — walk up from the entry.
	}
	try {
		let dir = dirname(req.resolve(pkg));
		for (let depth = 0; depth < 8; depth += 1) {
			const manifest = join(dir, 'package.json');
			if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, 'utf8'));
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	} catch {
		// No importable entry either — fall through to the directory walk.
	}
	// Both routes above go through the export map, and a package can decline to
	// export `.` as readily as `./package.json`. The manifest is a file on disk
	// regardless, so look for it directly.
	let from = resolve(cwd);
	for (let depth = 0; depth < 12; depth += 1) {
		const manifest = join(from, 'node_modules', ...pkg.split('/'), 'package.json');
		if (existsSync(manifest)) {
			try {
				return JSON.parse(readFileSync(manifest, 'utf8'));
			} catch {
				return null; // present but unreadable — treat as unknown, never throw
			}
		}
		const parent = dirname(from);
		if (parent === from) break;
		from = parent;
	}
	return null;
}

/** Does this manifest advertise Svelte source — a `svelte` field or export condition? */
function shipsSvelteSource(manifest: Record<string, unknown>): boolean {
	if (typeof manifest.svelte === 'string') return true;
	const seen = new Set<unknown>();
	const walk = (node: unknown): boolean => {
		if (!node || typeof node !== 'object' || seen.has(node)) return false;
		seen.add(node);
		return Object.entries(node as Record<string, unknown>).some(
			([key, value]) => key === 'svelte' || walk(value),
		);
	};
	return walk(manifest.exports);
}

/**
 * Project dependencies that ship components as `.svelte` source, for
 * `optimizeDeps.exclude`.
 *
 * Vite prebundles bare imports with esbuild, which has no `.svelte` loader. A package
 * like @lucide/svelte re-exports straight into source (`export { default } from
 * "./arrow-right.svelte"`), so the optimizer dies on it — the import 504s and the
 * component silently renders without its icons. Such packages announce themselves with
 * a `svelte` export condition; that's the signal to hand them to the svelte plugin
 * intact instead of to esbuild.
 *
 * vite-plugin-svelte normally derives this during its dependency scan, which sdocs
 * disables (`optimizeDeps.entries: []`) because Rolldown-based Vite can't crawl
 * `.svelte` entry graphs — so the list is built here instead. `svelte` itself is never
 * excluded: it ships compiled runtime code and is deliberately prebundled.
 */
export function svelteSourceDeps(cwd: string): string[] {
	let pkg: Record<string, unknown>;
	try {
		pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
	} catch {
		return [];
	}
	const declared = new Set<string>();
	for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
		const deps = pkg[field];
		if (deps && typeof deps === 'object') {
			for (const name of Object.keys(deps)) declared.add(name);
		}
	}
	declared.delete('svelte');
	return [...declared].filter((name) => {
		const manifest = packageManifest(cwd, name);
		return !!manifest && shipsSvelteSource(manifest);
	});
}

/**
 * The unfixable case: the project runs its own svelte but has no vite-plugin-svelte, so
 * sdocs must compile with its bundled copy. Harmless while the versions agree, fatal
 * when they drift — so name both versions and the one-line fix.
 */
export function warnIfToolchainSplit(cwd: string): void {
	const project = projectSvelteVersion(cwd);
	const bundled = bundledSvelteVersion();
	if (!project || !bundled || project === bundled) return;
	console.warn(
		`[sdocs] svelte ${bundled} will COMPILE, but your project runs svelte ${project}.\n` +
			`        Mismatched versions can break generated-code contracts (blank pages,\n` +
			`        "is not a function" errors from svelte internals).\n` +
			`        Fix: install @sveltejs/vite-plugin-svelte in the project so sdocs uses\n` +
			`        its toolchain, or align the two svelte versions.`
	);
}
