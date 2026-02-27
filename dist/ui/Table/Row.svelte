<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A table row. Use inside Head, Body, or Foot.
	 */
	interface Props {
		/** Row cells */
		children: Snippet;
		/** Additional CSS class */
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<tr class={className || undefined}>
	{@render children()}
</tr>
