<script lang="ts">
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';

	interface Props {
		doc: DocEntry;
		/** Native doc/page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
	}

	let { doc, pageModules = {} }: Props = $props();

	// A PAGE body is plain Svelte compiled to its own component. It renders
	// here in the docs context — sdocs CSS variables, no stage tooling, no
	// iframe — inside the same max-width container DOC pages use.
	let PageComponent = $state<Component | null>(null);

	$effect(() => {
		const load = doc.contentKey ? pageModules[doc.contentKey] : undefined;
		PageComponent = null;
		if (!load) return;
		let stale = false;
		load().then((mod) => {
			if (!stale) PageComponent = mod.default as Component;
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
