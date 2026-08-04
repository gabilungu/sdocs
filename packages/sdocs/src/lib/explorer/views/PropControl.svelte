<script lang="ts">
	import type { ParsedProp } from '../../types.js';
	import { Text as TextControl, Number as NumberControl, Checkbox as CheckboxControl, Select as SelectControl } from '../../ui/Control/index.js';
	import { unionOptions } from './format.js';

	interface Props {
		prop: ParsedProp;
		value: unknown;
		onchange: (value: unknown) => void;
		/** Remove the prop from args entirely (optional props only) */
		onunset: () => void;
	}

	let { prop, value, onchange, onunset }: Props = $props();

	const controlType = $derived.by(() => {
		const t = prop.type?.toLowerCase() ?? '';
		if (t === 'string') return 'text';
		if (t === 'number') return 'number';
		if (t === 'boolean') return 'boolean';
		if (unionOptions(prop.type)) return 'select';
		// A type that permits a string (e.g. `number | string`) → free-text box,
		// rather than no control at all.
		if (/\bstring\b/.test(t)) return 'text';
		return 'readonly';
	});

	const options = $derived(unionOptions(prop.type) ?? []);

	// When the type also allows a number (e.g. `number | string`), coerce a
	// plain-numeric entry to a number so a "number means px"-style convention
	// still works through the text box; anything else passes through as text.
	const coercesNumber = $derived(/\bnumber\b/.test(prop.type?.toLowerCase() ?? ''));
	function onText(v: unknown) {
		if (coercesNumber && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
			onchange(Number(v));
		} else {
			onchange(v);
		}
	}

	// Set means present in args — an empty string is a real value; unset means
	// the component renders its own default. The ✕ clears an optional prop
	// entirely; a required one falls back to its documented default instead.
	const isSet = $derived(value !== undefined && value !== null);
	const defaultAsValue = $derived.by(() => {
		if (prop.default == null) return undefined;
		if (controlType === 'number') return Number(prop.default);
		if (controlType === 'boolean') return prop.default === 'true';
		return String(prop.default);
	});
	const showUnset = $derived(
		controlType !== 'readonly' &&
			isSet &&
			(prop.required
				? defaultAsValue !== undefined && String(value) !== String(prop.default)
				: true),
	);
	function handleUnset() {
		if (prop.required) onchange(defaultAsValue);
		else onunset();
	}
</script>

<div class="sdocs-control-group">
	{#if controlType === 'text'}
		<TextControl
			value={isSet ? String(value) : ''}
			placeholder={prop.default ?? ''}
			onchange={onText}
		/>
	{:else if controlType === 'number'}
		<NumberControl
			value={isSet ? Number(value) : undefined}
			placeholder={prop.default ?? ''}
			{onchange}
		/>
	{:else if controlType === 'boolean'}
		<CheckboxControl value={Boolean(value ?? (prop.default === 'true'))} {onchange} />
	{:else if controlType === 'select'}
		<!-- Unset with no default → a "Please select…" placeholder, so an unset
		     enum prop reads as unset instead of silently showing option one. -->
		<SelectControl value={String(value ?? prop.default ?? '')} {options} placeholder="Please select…" {onchange} />
	{:else}
		<span class="sdocs-control-unsupported">—</span>
	{/if}
	{#if showUnset}
		<button
			class="sdocs-unset-btn"
			title={prop.required ? 'Reset to the default value' : 'Unset — the component uses its own default'}
			aria-label={prop.required ? `Reset ${prop.name} to its default` : `Unset ${prop.name}`}
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
	.sdocs-control-unsupported {
		color: var(--color-base-300);
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
			width: 40px;
			height: 40px;
			font-size: 18px;
		}
	}
</style>
