<script lang="ts">
	interface Props {
		/** Optional label; omit when the control sits next to its name (e.g. in a table) */
		label?: string;
		/** The control's accessible name when `label` is omitted. Without it the
		 * name is only in a neighbouring cell, which a screen reader does not
		 * read as this control's — it announces an unlabelled input. */
		name?: string;
		value: string;
		onchange: (value: string) => void;
	}

	let { label, name, value, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	{#if label}
		<span class="sdocs-control-label">{label}</span>
	{/if}
	<input
		type="color"
		{value}
		oninput={(e) => onchange(e.currentTarget.value)}
		class="sdocs-control-color"
		aria-label={label ? undefined : name}
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
		font-weight: 600;
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

	@media (max-width: 860px) {
		/* The swatch is the whole control — it has to be tappable. */
		.sdocs-control-color {
			width: 40px;
			height: 28px;
		}
	}
</style>
