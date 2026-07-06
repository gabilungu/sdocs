<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Heading shown in the toggle row */
		summary: string;
		/** Start expanded */
		open?: boolean;
		/** Called when the panel opens or closes */
		ontoggle?: (open: boolean) => void;
		/** Custom marker; receives the open state */
		marker?: Snippet<[open: boolean]>;
		/** Panel content */
		children: Snippet;
	}

	let { summary, open = false, ontoggle, marker, children }: Props = $props();

	// Writable derived: follows the prop, local toggles override it
	let isOpen = $derived(open);

	function toggle() {
		isOpen = !isOpen;
		ontoggle?.(isOpen);
	}
</script>

<div class="disclosure">
	<button type="button" onclick={toggle} aria-expanded={isOpen}>
		<span class="marker">
			{#if marker}
				{@render marker(isOpen)}
			{:else}
				{isOpen ? '▾' : '▸'}
			{/if}
		</span>
		{summary}
	</button>
	{#if isOpen}
		<div class="panel">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.disclosure {
		border: 1px solid var(--border, hsl(240 6% 90%));
		border-radius: 8px;
		min-width: 18rem;
	}

	button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.625rem 0.875rem;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 600;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.marker {
		width: 1rem;
		color: var(--text-soft, hsl(240 4% 46%));
	}

	.panel {
		padding: 0 0.875rem 0.75rem 2.375rem;
		color: var(--text-soft, hsl(240 4% 46%));
	}
</style>
