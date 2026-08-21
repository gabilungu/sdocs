<!--
@component
Shows where a value sits in a known range — a **measurement**, not a progress
bar. For something that fills over time, reach for a progress bar instead.

```svelte
<Meter value={64} max={100} label="Docs coverage" />
```
-->
<script lang="ts">
	/**
	 * @cssvar {color} --meter-fill - Fill color (default: hsl(221 83% 53%))
	 * @cssvar {color} --meter-track - Track color (default: hsl(240 5% 96%))
	 * @cssvar {dimension} --meter-height - Track height (default: 8px)
	 * @cssvar {dimension} --meter-radius - Corner radius (default: 999px)
	 */
	interface Props {
		/** Current value */
		value: number;
		/** Upper bound */
		max?: number;
		/** Label shown beside the percentage */
		label?: string;
	}

	let { value, max = 100, label = '' }: Props = $props();

	const ratio = $derived(Math.min(1, Math.max(0, value / max)));
</script>

<div class="meter">
	{#if label}
		<span class="label">{label} <b>{Math.round(ratio * 100)}%</b></span>
	{/if}
	<div class="track" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
		<div class="fill" style:width="{ratio * 100}%"></div>
	</div>
</div>

<style>
	.meter {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 16rem;
	}

	.label {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--text-soft, hsl(240 4% 46%));
	}

	.track {
		height: var(--meter-height, 8px);
		border-radius: var(--meter-radius, 999px);
		background: var(--meter-track, hsl(240 5% 96%));
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: inherit;
		background: var(--meter-fill, hsl(221 83% 53%));
	}
</style>
