<script lang="ts">
	interface Props {
		/** Optional label; omit when the control sits next to its name (e.g. in a table) */
		label?: string;
		value: number;
		onchange: (value: number) => void;
	}

	let { label, value, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	{#if label}
		<span class="sdocs-control-label">{label}</span>
	{/if}
	<input
		type="number"
		{value}
		oninput={(e) => onchange(Number(e.currentTarget.value))}
		class="sdocs-control-input"
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
	.sdocs-control-input {
		flex: 1;
		padding: 4px 8px;
		border: 1px solid var(--color-base-200);
		background: var(--color-base-0);
		color: var(--color-base-600);
		border-radius: 4px;
		font: inherit;
		font-size: 13px;
	}
</style>
