<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Table header section. Contains header rows.
	 */
	interface Props {
		/** Header rows */
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<thead>
	{@render children()}
</thead>
