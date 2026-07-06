<script lang="ts">
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';

	interface Props {
		doc: DocEntry;
		/** Native doc/page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		/** Already-resolved content components: the prerenderer passes all of
		 * them (effects never run server-side) and the built app's entry passes
		 * the current route's, so hydration matches the static HTML. */
		preloaded?: Record<string, Component>;
	}

	let { doc, pageModules = {}, preloaded = {} }: Props = $props();

	// A PAGE body is plain Svelte compiled to its own component. It renders
	// here in the docs context — sdocs CSS variables, no stage tooling, no
	// iframe — inside the same max-width container DOC pages use.
	let loaded = $state<Component | null>(null);
	const PageComponent = $derived(
		(doc.contentKey ? preloaded[doc.contentKey] : undefined) ?? loaded,
	);

	$effect(() => {
		if (doc.contentKey && preloaded[doc.contentKey]) return;
		const load = doc.contentKey ? pageModules[doc.contentKey] : undefined;
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

	// contentX places the container inside the view.
	const containerMargin = $derived(
		doc.contentX === 'center' ? '0 auto' : doc.contentX === 'right' ? '0 0 0 auto' : undefined,
	);
</script>

<div class="sdocs-svelte-page" style:padding={doc.padding}>
	<div class="sdocs-svelte-page-inner" style:max-width={doc.maxWidth} style:margin={containerMargin}>
		{#if PageComponent}
			<PageComponent />
		{/if}
	</div>
</div>

<style>
	.sdocs-svelte-page {
		/* padding comes from the doc entry (config/entity cascade) */
		font-family: var(--sans);
		color: var(--color-base-800);
	}
	.sdocs-svelte-page-inner {
		/* max-width and margin (contentX) come from the doc entry */
		min-width: 0;
	}
</style>
