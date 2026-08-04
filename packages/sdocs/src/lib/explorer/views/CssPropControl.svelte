<script lang="ts">
	import type { ParsedCssProp } from '../../types.js';
	import { Text as TextControl, Color as ColorControl, Dimension as DimensionControl } from '../../ui/Control/index.js';

	interface Props {
		cssProp: ParsedCssProp;
		value: string | undefined;
		/** The computed color when the default is a var() reference — resolved
		 * inside the preview iframe, where the project's theme lives. */
		resolvedColor?: string;
		onchange: (value: string) => void;
	}

	let { cssProp, value, resolvedColor, onchange }: Props = $props();

	// A var() reference is valid CSS to APPLY but opaque to a native color
	// input — show the resolved computed color instead.
	const colorValue = $derived.by(() => {
		const raw = value ?? cssProp.default ?? '';
		if (raw.startsWith('var(')) return resolvedColor ?? '#000000';
		return raw || '#000000';
	});

	const controlType = $derived.by(() => {
		const t = cssProp.type?.toLowerCase() ?? '';
		if (t === 'color') return 'color';
		if (t === 'dimension') return 'dimension';
		return 'text';
	});

	// A var at its documented default is not applied to the stage (the
	// component's own fallback provides it) — the ✕ returns a changed var to
	// that state.
	const changed = $derived(value !== undefined && value !== (cssProp.default ?? ''));
	function handleUnset() {
		onchange(cssProp.default ?? '');
	}
</script>

<div class="sdocs-control-group">
	{#if controlType === 'color'}
		<ColorControl value={colorValue} {onchange} />
	{:else if controlType === 'dimension'}
		<DimensionControl value={value ?? cssProp.default ?? '0px'} {onchange} />
	{:else}
		<TextControl value={value ?? cssProp.default ?? ''} {onchange} />
	{/if}
	{#if changed}
		<button
			class="sdocs-unset-btn"
			title="Reset to the default value"
			aria-label={`Reset ${cssProp.name} to its default`}
			onclick={handleUnset}
		>×</button>
	{/if}
</div>

<style>
	.sdocs-control-group {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.sdocs-control-group > :global(.sdocs-control) {
		flex: 1;
		min-width: 0;
	}
	.sdocs-unset-btn {
		flex: none;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: none;
		color: var(--color-base-400);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
	}
	.sdocs-unset-btn:hover {
		background: var(--color-base-100);
		color: var(--color-base-700);
	}

	@media (max-width: 860px) {
		.sdocs-unset-btn {
			width: 32px;
			height: 32px;
			font-size: 16px;
		}
	}
</style>
