<script lang="ts">
	interface Props {
		/** Optional label; omit when the control sits next to its name (e.g. in a table) */
		label?: string;
		value: boolean;
		onchange: (value: boolean) => void;
	}

	let { label, value, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	{#if label}
		<span class="sdocs-control-label">{label}</span>
	{/if}
	<input
		type="checkbox"
		checked={value}
		onchange={(e) => onchange(e.currentTarget.checked)}
		class="sdocs-control-checkbox"
	/>
</label>

<style>
	.sdocs-control {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.sdocs-control-label {
		min-width: 100px;
		color: var(--color-base-600);
		font-weight: 600;
	}
	.sdocs-control-checkbox {
		width: 16px;
		height: 16px;
	}

	@media (max-width: 860px) {
		/* A 16px box is half the width of a fingertip. */
		.sdocs-control-checkbox {
			width: 20px;
			height: 20px;
		}
	}
</style>
