<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Table footer section. Used for summary rows (totals, counts).
	 */
	interface Props {
		/** Footer rows */
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<tfoot>
	{@render children()}
</tfoot>
