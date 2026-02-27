<script lang="ts">
	/**
	 * A small inline label for displaying metadata like types, status, or categories.
	 *
	 * @cssvar {color} --Badge-bg - Background color (default: var(--base-100))
	 * @cssvar {color} --Badge-color - Text color (default: var(--base-600))
	 */
	interface Props {
		/** Text to display */
		label: string;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Border radius in pixels */
		radius?: number;
	}

	let { label = 'label', size = 'm', radius = 4 }: Props = $props();
</script>

<span class="Badge {size}" style:border-radius="{radius}px">
	{label}
</span>

<style>
	.Badge {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-weight: 500;
		white-space: nowrap;
		background: var(--Badge-bg, var(--base-100));
		color: var(--Badge-color, var(--base-600));
	}

	/* Size variants */
	.xs {
		height: 18px;
		padding: 0 5px;
		font-size: 10px;
	}

	.s {
		height: 20px;
		padding: 0 6px;
		font-size: 11px;
	}

	.m {
		height: 22px;
		padding: 0 7px;
		font-size: 12px;
	}

	.l {
		height: 26px;
		padding: 0 9px;
		font-size: 13px;
	}
</style>
