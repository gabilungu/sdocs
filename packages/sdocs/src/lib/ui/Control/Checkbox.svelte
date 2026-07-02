<script lang="ts">
	interface Props {
		label: string;
		value: boolean;
		onchange: (value: boolean) => void;
	}

	let { label, value, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	<span class="sdocs-control-label">{label}</span>
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
		font-weight: 500;
	}
	.sdocs-control-checkbox {
		width: 16px;
		height: 16px;
	}
</style>
