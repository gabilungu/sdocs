<script lang="ts">
	interface Props {
		/** Optional label; omit when the control sits next to its name (e.g. in a table) */
		label?: string;
		/** The control's accessible name when `label` is omitted. Without it the
		 * name is only in a neighbouring cell, which a screen reader does not
		 * read as this control's — it announces an unlabelled input. */
		name?: string;
		/** Absent while the prop is unset — the input shows only the placeholder */
		value?: number;
		/** Ghost text while the input is empty — e.g. the prop's default */
		placeholder?: string;
		onchange: (value: number) => void;
	}

	let { label, name, value, placeholder, onchange }: Props = $props();
</script>

<label class="sdocs-control">
	{#if label}
		<span class="sdocs-control-label">{label}</span>
	{/if}
	<input
		type="number"
		value={value ?? ''}
		{placeholder}
		oninput={(e) => onchange(Number(e.currentTarget.value))}
		class="sdocs-control-input"
		aria-label={label ? undefined : name}
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

	@media (max-width: 860px) {
		/* Safari zooms the page when it focuses a field under 16px, so the text
		   stays 16px. The height is border-box: as content-box the padding and
		   border sat OUTSIDE it and a 40px rule measured 50 — taller than the
		   select beside it, and heavier than this dense a table wants. */
		.sdocs-control-input {
			box-sizing: border-box;
			min-height: 36px;
			font-size: 16px;
		}
	}
</style>
