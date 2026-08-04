<script lang="ts">
	interface Props {
		/** Optional label; omit when the control sits next to its name (e.g. in a table) */
		label?: string;
		value: string;
		options: string[];
		/** Shown as a disabled first option while no real option is selected —
		 * without it a value-less select silently displays the first option. */
		placeholder?: string;
		onchange: (value: string) => void;
	}

	let { label, value, options, placeholder, onchange }: Props = $props();

	const unset = $derived(placeholder !== undefined && !options.includes(value));
</script>

<label class="sdocs-control">
	{#if label}
		<span class="sdocs-control-label">{label}</span>
	{/if}
	<select
		class="sdocs-control-select"
		value={unset ? '' : value}
		onchange={(e) => onchange(e.currentTarget.value)}
	>
		{#if unset}
			<option value="" disabled selected>{placeholder}</option>
		{/if}
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
		font-weight: 600;
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
	}

	@media (max-width: 860px) {
		/* Safari zooms the page when it focuses a field under 16px, so the text
		   stays 16px. The height is border-box: as content-box the padding and
		   border sat OUTSIDE it and a 40px rule measured 50 — taller than the
		   select beside it, and heavier than this dense a table wants. */
		.sdocs-control-select {
			box-sizing: border-box;
			min-height: 36px;
			font-size: 16px;
		}
	}
</style>
