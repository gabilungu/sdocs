<script lang="ts">
	import type { ParsedProp, ParsedCssProp } from '../../types.js';
	import { Text as TextControl, Number as NumberControl, Checkbox as CheckboxControl, Color as ColorControl, Dimension as DimensionControl, Select as SelectControl } from '../../ui/Control/index.js';

	interface Props {
		componentProps: ParsedProp[];
		cssProps: ParsedCssProp[];
		propValues: Record<string, unknown>;
		cssValues: Record<string, string>;
		onPropChange: (name: string, value: unknown) => void;
		onCssChange: (name: string, value: string) => void;
		onReset: () => void;
	}

	let { componentProps, cssProps, propValues, cssValues, onPropChange, onCssChange, onReset }: Props = $props();

	// Only show controls for regular props (not events or snippets)
	const editableProps = $derived(componentProps.filter((p) => p.category === 'prop'));

	/** Parse union type strings like "'sm' | 'md' | 'lg'" or "1 | 2 | 3" into option arrays */
	function parseUnionOptions(type: string | null): string[] | null {
		if (!type || !type.includes('|')) return null;
		const parts = type.split('|').map((s) => s.trim());
		const values: string[] = [];
		let allStrings = true;
		let allNumbers = true;
		for (const part of parts) {
			// Quoted string: 'value' or "value"
			const strMatch = part.match(/^['"](.+)['"]$/);
			if (strMatch) {
				values.push(strMatch[1]);
				allNumbers = false;
				continue;
			}
			// Bare number: 1, 2, 3
			if (/^\d+(\.\d+)?$/.test(part)) {
				values.push(part);
				allStrings = false;
				continue;
			}
			// Mixed or unsupported (e.g. 'medium' | number) → null
			return null;
		}
		if (values.length > 0 && (allStrings || allNumbers)) return values;
		return null;
	}

	function getControlType(prop: ParsedProp): 'text' | 'number' | 'boolean' | 'select' | 'readonly' {
		const t = prop.type?.toLowerCase() ?? '';
		if (t === 'string') return 'text';
		if (t === 'number') return 'number';
		if (t === 'boolean') return 'boolean';
		if (parseUnionOptions(prop.type)) return 'select';
		return 'readonly';
	}

	function getCssControlType(cssProp: ParsedCssProp): 'color' | 'dimension' | 'text' {
		const t = cssProp.type?.toLowerCase() ?? '';
		if (t === 'color') return 'color';
		if (t === 'dimension') return 'dimension';
		return 'text';
	}
</script>

<div class="sdocs-controls">
	{#if editableProps.length > 0}
		<div class="sdocs-controls-section">
			<div class="sdocs-controls-section-title">Props</div>
			{#each editableProps as prop (prop.name)}
				{@const controlType = getControlType(prop)}
				{#if controlType === 'text'}
					<TextControl
						label={prop.name}
						value={String(propValues[prop.name] ?? prop.default ?? '')}
						onchange={(v) => onPropChange(prop.name, v)}
					/>
				{:else if controlType === 'number'}
					<NumberControl
						label={prop.name}
						value={Number(propValues[prop.name] ?? prop.default ?? 0)}
						onchange={(v) => onPropChange(prop.name, v)}
					/>
				{:else if controlType === 'boolean'}
					<CheckboxControl
						label={prop.name}
						value={Boolean(propValues[prop.name] ?? (prop.default === 'true'))}
						onchange={(v) => onPropChange(prop.name, v)}
					/>
				{:else if controlType === 'select'}
					{@const options = parseUnionOptions(prop.type) ?? []}
					<SelectControl
						label={prop.name}
						value={String(propValues[prop.name] ?? prop.default ?? options[0] ?? '')}
						{options}
						onchange={(v) => onPropChange(prop.name, v)}
					/>
				{:else}
					<div class="sdocs-control-readonly">
						<span class="sdocs-control-label">{prop.name}</span>
						<span class="sdocs-control-type">{prop.type ?? 'unknown'}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if cssProps.length > 0}
		<div class="sdocs-controls-section">
			<div class="sdocs-controls-section-title">CSS Custom Properties</div>
			{#each cssProps as cssProp (cssProp.name)}
				{@const cssType = getCssControlType(cssProp)}
				{#if cssType === 'color'}
					<ColorControl
						label={cssProp.name}
						value={cssValues[cssProp.name] ?? cssProp.default ?? '#000000'}
						onchange={(v) => onCssChange(cssProp.name, v)}
					/>
				{:else if cssType === 'dimension'}
					<DimensionControl
						label={cssProp.name}
						value={cssValues[cssProp.name] ?? cssProp.default ?? '0px'}
						onchange={(v) => onCssChange(cssProp.name, v)}
					/>
				{:else}
					<TextControl
						label={cssProp.name}
						value={cssValues[cssProp.name] ?? cssProp.default ?? ''}
						onchange={(v) => onCssChange(cssProp.name, v)}
					/>
				{/if}
			{/each}
		</div>
	{/if}

	<button class="sdocs-reset-btn" onclick={onReset}>Reset</button>
</div>

<style>
	.sdocs-controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sdocs-controls-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sdocs-controls-section-title {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-base-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.sdocs-control-readonly {
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
	.sdocs-control-type {
		color: var(--color-base-400);
		font-family: var(--mono);
		font-size: 12px;
	}
	.sdocs-reset-btn {
		align-self: flex-start;
		padding: 4px 12px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		font: inherit;
		font-size: 12px;
		color: var(--color-base-600);
		cursor: pointer;
	}
	.sdocs-reset-btn:hover {
		background: var(--color-base-100);
	}
</style>
