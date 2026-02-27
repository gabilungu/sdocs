<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Table body section. Contains data rows.
	 */
	interface Props {
		/** Data rows */
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<tbody>
	{@render children()}
</tbody>
