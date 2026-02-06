<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A table header cell. Use inside Row.
	 */
	interface Props {
		/** Cell content */
		children: Snippet;
		/** Number of columns to span */
		colspan?: number;
		/** Text alignment */
		align?: 'left' | 'center' | 'right';
		/** Column width (e.g. '20%', '200px') */
		width?: string;
	}

	let { children, colspan, align, width }: Props = $props();
</script>

<th
	{colspan}
	style:text-align={align}
	style:width={width}
>
	{@render children()}
</th>
