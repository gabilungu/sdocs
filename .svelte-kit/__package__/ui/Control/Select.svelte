<script lang="ts">
	interface Props {
		label: string;
		value: string;
		options: string[];
		onchange: (value: string) => void;
	}

	let { label, value, options, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	<span class="sdocs-control-label">{label}</span>
	<select
		class="sdocs-control-select"
		{value}
		onchange={(e) => onchange(e.currentTarget.value)}
	>
		{#each options as opt (opt)}
			<option value={opt} selected={opt === value}>{opt}</option>
		{/each}
	</select>
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
	.sdocs-control-select {
		flex: 1;
		padding: 4px 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		font: inherit;
		font-size: 13px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		max-width: 200px;
	}
</style>
