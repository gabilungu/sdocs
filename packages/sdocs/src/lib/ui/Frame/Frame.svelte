<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A flexible layout component with slots for top, bottom, left, right, and center content.
	 */
	interface Props {
		top?: Snippet;
		bottom?: Snippet;
		left?: Snippet;
		right?: Snippet;
		children?: Snippet;
		class?: string;
	}

	let { top, bottom, left, right, children, class: className = '' }: Props = $props();
</script>

<div class="Frame {className}">
	{#if top}
		<div class="Frame-top">
			{@render top()}
		</div>
	{/if}

	<div class="Frame-body">
		{#if left}
			<div class="Frame-left">
				{@render left()}
			</div>
		{/if}

		<div class="Frame-middle">
			{#if children}
				{@render children()}
			{/if}
		</div>

		{#if right}
			<div class="Frame-right">
				{@render right()}
			</div>
		{/if}
	</div>

	{#if bottom}
		<div class="Frame-bottom">
			{@render bottom()}
		</div>
	{/if}
</div>

<style>
	.Frame {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
	}

	.Frame-top {
		flex-shrink: 0;
	}

	.Frame-body {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.Frame-left {
		flex-shrink: 0;
	}

	.Frame-middle {
		flex: 1;
		min-width: 0;
		overflow: auto;
	}

	.Frame-right {
		flex-shrink: 0;
	}

	.Frame-bottom {
		flex-shrink: 0;
	}
</style>
