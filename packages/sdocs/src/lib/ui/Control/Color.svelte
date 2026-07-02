<script lang="ts">
	interface Props {
		label: string;
		value: string;
		onchange: (value: string) => void;
	}

	let { label, value, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	<span class="sdocs-control-label">{label}</span>
	<input
		type="color"
		{value}
		oninput={(e) => onchange(e.currentTarget.value)}
		class="sdocs-control-color"
	/>
	<span class="sdocs-control-value">{value}</span>
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
	.sdocs-control-color {
		width: 32px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		cursor: pointer;
	}
	.sdocs-control-value {
		color: var(--color-base-500);
		font-family: var(--mono);
		font-size: 12px;
	}
</style>
