<script lang="ts">
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';
	import { capSidePadding, isNarrow } from '../viewport.svelte.js';
	import { Note } from '../../ui/Note/index.js';
	import ContentError from './ContentError.svelte';
	import { displayTitle } from '../tree-builder.js';
	import { usePageModule, type PageModules } from '../page-module.svelte.js';

	interface Props {
		doc: DocEntry;
		/** Native doc/page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: PageModules;
		/** Already-resolved content components: the prerenderer passes all of
		 * them (effects never run server-side) and the built app's entry passes
		 * the current route's, so hydration matches the static HTML. */
		preloaded?: Record<string, Component>;
	}

	let { doc, pageModules = {}, preloaded = {} }: Props = $props();

	// A PAGE body is plain Svelte compiled to its own component. It renders
	// here in the docs context — sdocs CSS variables, no stage tooling, no
	// iframe — inside the same max-width container DOC pages use.
	const content = usePageModule(
		() => doc.contentKey,
		() => pageModules,
		() => preloaded,
		'page content',
	);
	const PageComponent = $derived(content.component);

	// contentX places the container inside the view.
	const containerMargin = $derived(
		doc.contentX === 'center' ? '0 auto' : doc.contentX === 'right' ? '0 0 0 auto' : undefined,
	);

	// Desktop-authored side padding is too dear to keep on a phone.
	const viewPadding = $derived(isNarrow() ? capSidePadding(doc.padding) : doc.padding);
</script>

<div class="sdocs-svelte-page" style:padding={viewPadding}>
	<div class="sdocs-svelte-page-inner" style:max-width={doc.maxWidth} style:margin={containerMargin}>
		<!-- Today this list is always empty: a [PAGE] body is taken whole as
		     Svelte, and the parser reports a [NOTES] block in it rather than
		     capturing it. Were a page to carry notes, they would open it —
		     a [PAGE] renders no title to sit under — and stay in the flow,
		     since a banner laid over a scrolling page covers what the reader
		     scrolled to. -->
		{#if doc.meta?.notes?.length}
			<div class="sdocs-page-note">
				{#each doc.meta.notes as entry, i (i)}
					<Note text={entry.note} type={entry.type} />
				{/each}
			</div>
		{/if}
		{#if PageComponent}
			<svelte:boundary>
				<PageComponent />
				{#snippet failed(error)}
					<ContentError {error} kind="render" title={displayTitle(doc.meta.title)} />
				{/snippet}
			</svelte:boundary>
		{:else if content.error}
			<ContentError error={content.error} kind="load" title={displayTitle(doc.meta.title)} />
		{/if}
	</div>
</div>

<style>
	.sdocs-page-note {
		margin-bottom: 16px;
	}
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
