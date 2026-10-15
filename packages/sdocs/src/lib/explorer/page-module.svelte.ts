/**
 * Loads a body that compiles to its own Svelte component — a `[DOC]`'s or
 * `[PAGE]`'s content, a `[SHOWCASE]`'s `[PROSE]` block — by key from the
 * `pageModules` map of `virtual:sdocs`.
 *
 * Prerendering resolves these ahead of time (effects never run server-side)
 * and the built app's entry passes the current route's, so a preloaded
 * component is used as-is, synchronously, and hydration matches the static
 * HTML. Everything else is imported in the browser, for the route the reader
 * is actually on.
 */

import type { Component } from 'svelte';

export type PageModules = Record<string, () => Promise<{ default: unknown }>>;

/**
 * Call during component init. `what` names the body in the console error a
 * failed import logs. Returns reactive getters for the component (null until
 * it arrives) and for the load error, if the chunk never arrives — which used
 * to render as nothing at all, and say so only as an unhandled rejection.
 */
export function usePageModule(
	key: () => string | undefined,
	pageModules: () => PageModules,
	preloaded: () => Record<string, Component>,
	what: string,
): { readonly component: Component | null; readonly error: unknown } {
	let loaded = $state<Component | null>(null);
	let error = $state<unknown>(null);
	const component = $derived.by(() => {
		const k = key();
		return (k ? preloaded()[k] : undefined) ?? loaded;
	});

	$effect(() => {
		const k = key();
		if (k && preloaded()[k]) return;
		const load = k ? pageModules()[k] : undefined;
		loaded = null;
		error = null;
		if (!load) return;
		let stale = false;
		load()
			.then((mod) => {
				if (!stale) loaded = mod.default as Component;
			})
			.catch((err) => {
				if (stale) return;
				console.error(`[sdocs] ${what} failed to load:`, err);
				error = err;
			});
		return () => {
			stale = true;
		};
	});

	return {
		get component() {
			return component;
		},
		get error() {
			return error;
		},
	};
}
