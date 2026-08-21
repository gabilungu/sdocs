<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import PreviewFrame from './PreviewFrame.svelte';
	import diagonalsUrl from './diagonals.png';
	import TwoPaneSplit from '../../ui/TwoPaneSplit/TwoPaneSplit.svelte';
	import { layoutWidth, setLayoutWidth, clearLayoutWidth } from '../layout-width.svelte.js';
	import { isNarrow } from '../viewport.svelte.js';
	import { Note } from '../../ui/Note/index.js';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
		/** Dev only: the note editor writes to the project's source. */
		dev?: boolean;
	}

	let { doc, activeStylesheet, dev = false }: Props = $props();

	const contentSnippet = $derived(doc.content);

	// Fully expanded without an override — the layout hugs the right edge of
	// the page, the handle bar riding against it. Dragging sets the width
	// shared by every layout page, persisted across reloads.
	const effectiveWidth = $derived(layoutWidth() ?? 'calc(100% - 10px)');

	// The stored width is a desktop measurement — a remembered 1200px would
	// leave a phone showing a sliver of the layout with no handle to widen it
	// again. On a narrow screen the layout simply fills the view.
	const narrow = $derived(isNarrow());

	// A layout fills the view and shows no title, so its note has nowhere of
	// its own to sit — it rides over the top of the layout instead, and can be
	// dismissed to uncover what it is about. Dismissal is per visit and per
	// layout: moving to another layout brings its own note up.
	let dismissed = $state<number[]>([]);
	const notes = $derived(doc.meta?.notes ?? []);
	$effect(() => {
		void doc.entitySlug;
		dismissed = [];
	});
</script>

<div class="sdocs-layout-view">
	<!-- No note button here. A [LAYOUT] body is captured whole as Svelte
	     markup, so a [NOTES] block written into it is never read back — it
	     renders as literal text over the layout. The rendering below stays:
	     the day the scanner captures blocks for [LAYOUT], notes arrive here
	     with nothing else to change. -->
	{#if notes.length > dismissed.length}
		<div class="sdocs-layout-note">
			{#each notes as entry, i (i)}
				{#if !dismissed.includes(i)}
					<Note
						text={entry.note}
						type={entry.type}
						onclose={() => (dismissed = [...dismissed, i])}
					/>
				{/if}
			{/each}
		</div>
	{/if}
	{#if contentSnippet?.previewUrl}
		{@const previewUrl = contentSnippet.previewUrl}
		{#snippet pane()}
			<div class="sdocs-layout-pane">
				<PreviewFrame src={previewUrl} {activeStylesheet} fullHeight stage={contentSnippet} />
			</div>
		{/snippet}
		{#if narrow}
			{@render pane()}
		{:else}
			<TwoPaneSplit
				bind:leftWidth={() => effectiveWidth, (v) => setLayoutWidth(v as number)}
				leftMinWidth={1}
				handleBarWidth={10}
				height="fill"
			>
				{#snippet left()}
					{@render pane()}
				{/snippet}
				{#snippet right()}
					<div class="sdocs-resize-canvas" style:background-image={`url(${diagonalsUrl})`}></div>
				{/snippet}
			</TwoPaneSplit>
			{@const w = layoutWidth()}
			{#if w !== null}
				<button
					class="sdocs-resize-readout"
					style:left={`min(${w + 18}px, calc(100% - 64px))`}
					title="Reset width"
					onclick={clearLayoutWidth}
				>
					{w}px
				</button>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.sdocs-layout-view {
		position: relative;
		height: 100%;
		/* Clip the x-overhang (handle lip, runaway readout) — no scrollbar. */
		overflow-x: clip;
		display: flex;
		flex-direction: column;
		/* The handle bar is invisible until hovered, like the component view,
		   and the grip line sits light until then. */
		--handleBg: transparent;
		--handleColor: var(--color-base-300);
		--hoverHandleColor: var(--color-base-0);
	}
	.sdocs-layout-view > :global(.TwoPaneSplit) {
		flex: 1;
		min-height: 0;
	}
	/* Without the split the pane is the direct child and takes its place. */
	.sdocs-layout-view > .sdocs-layout-pane {
		flex: 1;
		min-height: 0;
	}
	.sdocs-layout-pane {
		height: 100%;
		box-sizing: border-box;
		background: var(--color-base-0);
		/* The full-height PreviewFrame sizes itself with flex: 1 — give it the
		   flex context it had when it was a direct child of the view. */
		display: flex;
		flex-direction: column;
	}
	/* Over the layout, not in front of the handle: the note clears the strip
	   the resize bar rides in, and never eats a click meant for it. */
	.sdocs-layout-note {
		display: flex;
		flex-direction: column;
		gap: 6px;
		position: absolute;
		top: 12px;
		left: 12px;
		right: 22px;
		z-index: 4;
	}
	/* Each note casts its own shadow. On the stack instead, the shadow also
	   falls across the gap between two notes, drawing a band where there is
	   nothing — the wrapper itself has no surface of its own. */
	.sdocs-layout-note :global(.Note) {
		box-shadow: 0 2px 12px rgb(0 0 0 / 0.12);
	}
	.sdocs-resize-canvas {
		height: 100%;
		box-sizing: border-box;
		/* The diagonal-hatch tile (an image beats hairline gradients, which
		   shimmer at fractional device-pixel ratios). The 26px tile is a 2x
		   export — displayed at 13px it maps 1:1 to retina device pixels. */
		background-repeat: repeat;
		background-size: 13px 13px;
	}
	/* Rides beside the handle, vertically centred, clamped inside the view so
	   it stays reachable when the window shrinks below the stored width.
	   Clicking it resets the layout to full width. */
	.sdocs-resize-readout {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		z-index: 3;
		display: inline-block;
		padding: 2px 7px;
		border: 1px solid var(--color-base-150);
		border-radius: 4px;
		background: var(--color-base-0);
		font-family: var(--mono, monospace);
		font-size: 11px;
		color: var(--color-base-500);
		white-space: nowrap;
		cursor: pointer;
	}
	.sdocs-resize-readout:hover {
		background: var(--color-base-50);
		color: var(--color-base-700);
	}
</style>
