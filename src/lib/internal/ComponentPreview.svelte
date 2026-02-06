<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A container for previewing components with consistent styling.
	 */
	interface Props {
		/** Padding size */
		padding?: 's' | 'm' | 'l';
		/** Whether to center content */
		centered?: boolean;
		/** CSS custom properties to apply */
		cssVars?: Record<string, string>;
		/** Children content */
		children?: Snippet;
	}

	let { padding = 'm', centered = true, cssVars = {}, children }: Props = $props();

	// Build style string from CSS vars
	let styleString = $derived(
		Object.entries(cssVars)
			.filter(([_, v]) => v)
			.map(([k, v]) => `${k}: ${v}`)
			.join('; '),
	);
</script>

<div class="ComponentPreview {padding}" class:centered style={styleString || undefined}>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.ComponentPreview {
		background: var(--color-bg-elevated);
	}

	.centered {
		display: flex;
		/* align-items: center; */
		/* justify-content: center; */
	}

	/* Padding sizes */
	.s {
		padding: 16px;
	}

	.m {
		padding: 32px;
	}

	.l {
		padding: 40px;
	}
</style>
