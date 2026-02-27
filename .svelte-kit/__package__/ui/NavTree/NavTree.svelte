<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<nav class="NavTree {className}">
	{#if children}
		{@render children()}
	{/if}
</nav>

<style>
	.NavTree {
		font-size: 13px;
		line-height: 1.4;
		color: var(--font-color, #111827);
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--p, 0);
		margin: var(--m, 0);
		border-radius: var(--r, 0);
		border: var(--b, none);
	}
</style>
