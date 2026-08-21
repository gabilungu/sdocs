<!--
	A body that compiles to its own Svelte component — a `[DOC]`'s content or a
	`[SHOWCASE]`'s `[PROSE]` block — loaded by key from `virtual:sdocs`.

	Prerendering resolves these ahead of time (effects never run server-side),
	so a preloaded component is used as-is and the import only runs in the
	browser, for the route the reader is actually on.
-->
<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		/** Key into `pageModules` / `preloaded`; nothing renders without one. */
		key?: string;
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		preloaded?: Record<string, Component>;
	}

	let { key, pageModules = {}, preloaded = {} }: Props = $props();

	let loaded = $state<Component | null>(null);
	const Body = $derived((key ? preloaded[key] : undefined) ?? loaded);

	$effect(() => {
		if (key && preloaded[key]) return;
		const load = key ? pageModules[key] : undefined;
		loaded = null;
		if (!load) return;
		let stale = false;
		load().then((mod) => {
			if (!stale) loaded = mod.default as Component;
		});
		return () => {
			stale = true;
		};
	});
</script>

{#if Body}
	<Body />
{/if}
