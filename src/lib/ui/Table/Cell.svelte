<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A table data cell. Use inside Row.
	 */
	interface Props {
		/** Cell content */
		children: Snippet;
		/** Number of columns to span */
		colspan?: number;
		/** Text alignment */
		align?: 'left' | 'center' | 'right';
	}

	let { children, colspan, align }: Props = $props();
</script>

<td
	{colspan}
	style:text-align={align}
>
	{@render children()}
</td>
