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
import { resolve } from 'node:path';

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
 * vite-plugin-svelte from the PROJECT when it has one — which is what makes the
 * compiler match the runtime, since the plugin binds `svelte/compiler` from beside
 * itself. Falls back to sdocs' own copy (standalone use, or a project without the
 * plugin), warning when that leaves the toolchain split.
 */
export async function loadSveltePlugin(cwd: string): Promise<SveltePlugin> {
	try {
		const entry = projectRequire(cwd).resolve('@sveltejs/vite-plugin-svelte');
		const mod = await import(pathToFileURL(entry).href);
		return mod.svelte as SveltePlugin;
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
		return (await import(pathToFileURL(entry).href)) as typeof import('svelte/compiler');
	} catch {
		return await import('svelte/compiler');
	}
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
