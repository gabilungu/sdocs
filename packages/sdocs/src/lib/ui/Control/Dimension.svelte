<script lang="ts">
	interface Props {
		label: string;
		value: string;
		onchange: (value: string) => void;
	}

	let { label, value, onchange }: Props = $props();
	const numericValue = $derived(parseInt(value) || 0);
</script>

<label class="sdocs-control">
	<span class="sdocs-control-label">{label}</span>
	<div class="sdocs-control-dimension">
		<input
			type="number"
			value={numericValue}
			oninput={(e) => onchange(e.currentTarget.value + 'px')}
			class="sdocs-control-input"
		/>
		<span class="sdocs-control-unit">px</span>
	</div>
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
		font-weight: 500;
	}
	.sdocs-control-dimension {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.sdocs-control-input {
		width: 80px;
		padding: 4px 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		font: inherit;
		font-size: 13px;
		background: var(--color-base-0);
		color: var(--color-base-600);
	}
	.sdocs-control-unit {
		color: var(--color-base-400);
		font-size: 12px;
	}
</style>
