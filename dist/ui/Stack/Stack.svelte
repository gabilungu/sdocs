<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A flexible Stack layout component for arranging elements vertically or horizontally.
	 */
	interface Props {
		/** Stack direction (CSS flex-direction) */
		direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
		/** Gap between items (any CSS dimension) */
		gap?: string;
		/** Padding (any CSS dimension) */
		padding?: string;
		/** Background color (any CSS color) */
		bg?: string;
		/** Children content */
		children?: Snippet;
	}

	let {
		direction = 'column',
		gap = '0',
		padding = '0',
		bg,
		children
	}: Props = $props();
</script>

<div
	class="Stack"
	style:flex-direction={direction}
	style:gap
	style:padding
	style:background={bg}
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.Stack {
		display: flex;
	}
</style>
