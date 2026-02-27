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
	<!-- Inline style: Svelte's CSS analysis drops `all` shorthand from scoped styles.
		 Inline styles have highest specificity, beating .sdocs * { all: revert } -->
	<div style="all: initial; display: block;">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.ComponentPreview {
		background: var(--color-bg-elevated);
	}

	.centered {
		display: flex;
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
