<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * An accessible table caption. Announced by screen readers when navigating to the table.
	 */
	interface Props {
		/** Caption content */
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<caption>
	{@render children()}
</caption>
