<script lang="ts">
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';
	import { capSidePadding, isNarrow } from '../viewport.svelte.js';
	import { Note } from '../../ui/Note/index.js';
	import NoteControl from './NoteControl.svelte';

	interface Props {
		doc: DocEntry;
		/** Native doc/page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		/** Already-resolved content components: the prerenderer passes all of
		 * them (effects never run server-side) and the built app's entry passes
		 * the current route's, so hydration matches the static HTML. */
		preloaded?: Record<string, Component>;
		/** Dev only: the note editor writes to the project's source. */
		dev?: boolean;
	}

	let { doc, pageModules = {}, preloaded = {}, dev = false }: Props = $props();

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

	// Desktop-authored side padding is too dear to keep on a phone.
	const viewPadding = $derived(isNarrow() ? capSidePadding(doc.padding) : doc.padding);
</script>

<div class="sdocs-svelte-page" style:padding={viewPadding}>
	<!-- A [PAGE] shows no title either, so the button hides in the corner the
	     way a layout's does. -->
	<NoteControl
		{dev}
		variant="corner"
		label={doc.meta.title}
		file={doc.filePath}
		entitySlug={doc.entitySlug}
		notes={doc.meta?.notes ?? []}
	/>
	<div class="sdocs-svelte-page-inner" style:max-width={doc.maxWidth} style:margin={containerMargin}>
		<!-- A [PAGE] renders no title of its own, so the note opens the page
		     rather than sitting under a heading that isn't there. It stays in
		     the flow: a page scrolls, and a banner laid over it would cover
		     content the reader scrolled to. -->
		{#if doc.meta?.notes?.length}
			<div class="sdocs-page-note">
				{#each doc.meta.notes as entry, i (i)}
					<Note text={entry.note} type={entry.type} />
				{/each}
			</div>
		{/if}
		{#if PageComponent}
			<PageComponent />
		{/if}
	</div>
</div>

<style>
	.sdocs-page-note {
		margin-bottom: 16px;
	}
	.sdocs-svelte-page {
		/* The corner note button positions against this. */
		position: relative;
		/* padding comes from the doc entry (config/entity cascade) */
		font-family: var(--sans);
		color: var(--color-base-800);
	}
	.sdocs-svelte-page-inner {
		/* max-width and margin (contentX) come from the doc entry */
		min-width: 0;
	}
</style>
