<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import PreviewFrame from './PreviewFrame.svelte';
	import TwoPaneSplit from '../../ui/TwoPaneSplit/TwoPaneSplit.svelte';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
	}

	let { doc, activeStylesheet }: Props = $props();

	const contentSnippet = $derived(doc.content);

	// Fully expanded by default: the layout hugs the right edge of the page,
	// the handle bar riding against it. Dragging narrows the frame to test
	// responsive behaviour; resets when the entity changes.
	let previewWidth = $state<number | string>('calc(100% - 10px)');
	$effect(() => {
		doc;
		previewWidth = 'calc(100% - 10px)';
	});
</script>

<div class="sdocs-layout-view">
	{#if contentSnippet?.previewUrl}
		{@const previewUrl = contentSnippet.previewUrl}
		<TwoPaneSplit bind:leftWidth={previewWidth} leftMinWidth={1} handleBarWidth={10} height="fill">
			{#snippet left()}
				<div class="sdocs-layout-pane">
					<PreviewFrame src={previewUrl} {activeStylesheet} fullHeight />
				</div>
			{/snippet}
			{#snippet right()}
				<div class="sdocs-resize-canvas"></div>
			{/snippet}
		</TwoPaneSplit>
		{#if typeof previewWidth === 'number'}
			<button
				class="sdocs-resize-readout"
				style:left={`min(${previewWidth + 18}px, calc(100% - 64px))`}
				title="Reset width"
				onclick={() => (previewWidth = 'calc(100% - 10px)')}
			>
				{previewWidth}px
			</button>
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
		/* The handle bar is invisible until hovered, like the component view. */
		--handleBg: transparent;
	}
	.sdocs-layout-view > :global(.TwoPaneSplit) {
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
	.sdocs-resize-canvas {
		height: 100%;
		box-sizing: border-box;
		background:
			repeating-linear-gradient(
				45deg,
				transparent 0 6px,
				var(--color-base-100) 6px 7px
			);
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
