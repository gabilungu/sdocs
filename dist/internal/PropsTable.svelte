<script lang="ts">
	import type { ArgType, ArgTypes } from '../types.js';
	import { Checkbox, SegmentControl, InputText, InputNumber, Placeholder, Table } from '../ui/index.js';
	import type { default as PlaceholderType } from '../ui/Placeholder/Placeholder.svelte';

	interface Props {
		argTypes: ArgTypes;
		args: Record<string, unknown>;
		/** Callback when args change (enables interactive controls) */
		onchange?: (args: Record<string, unknown>) => void;
	}

	let { argTypes, args, onchange }: Props = $props();

	let isInteractive = $derived(!!onchange);

	let bangRefs: Record<string, PlaceholderType> = {};

	// Get sorted prop names
	let propNames = $derived(Object.keys(argTypes).sort());

	function getTypeName(argType: ArgTypes[string]): string {
		if (argType.type) {
			if (typeof argType.type === 'string') return argType.type;
			if (argType.type.name) return argType.type.name;
		}
		if (argType.control) {
			if (typeof argType.control === 'string') return argType.control;
			if (argType.control.type) return argType.control.type;
		}
		return '-';
	}

	function getDefaultValue(name: string, argType: ArgTypes[string]): string {
		if (argType.defaultValue !== undefined) {
			return formatValue(argType.defaultValue);
		}
		if (args[name] !== undefined) {
			return formatValue(args[name]);
		}
		return '-';
	}

	function formatValue(value: unknown): string {
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		if (typeof value === 'string') return value;
		if (typeof value === 'boolean') return value ? 'true' : 'false';
		if (typeof value === 'number') return String(value);
		if (typeof value === 'function') return 'Function';
		if (Array.isArray(value)) return JSON.stringify(value);
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function getDescription(argType: ArgTypes[string]): string {
		return argType.description ?? '-';
	}

	function isRequired(argType: ArgTypes[string]): boolean {
		return argType.required === true;
	}

	// Control helpers
	function getControlType(key: string, argType: ArgType): string | false {
		if (argType.control === false) return false;
		if (typeof argType.control === 'string') return argType.control;
		if (typeof argType.control === 'object') return argType.control.type;
		// Infer from value
		const value = args[key];
		if (typeof value === 'boolean') return 'boolean';
		if (typeof value === 'number') return 'number';
		return 'text';
	}

	function getControlOptions(argType: ArgType): string[] | undefined {
		if (argType && typeof argType.control === 'object') {
			return argType.control.options;
		}
		return undefined;
	}

	function getControlConfig(argType: ArgType): { min?: number; max?: number; step?: number } {
		if (argType && typeof argType.control === 'object') {
			return { min: argType.control.min, max: argType.control.max, step: argType.control.step };
		}
		return {};
	}

	function isFunctionType(argType: ArgType): boolean {
		const typeName = typeof argType.type === 'string' ? argType.type : argType.type?.name ?? '';
		return typeName.includes('=>') || typeName.toLowerCase() === 'function' || typeName.startsWith('(');
	}

	export function bangProp(name: string) {
		bangRefs[name]?.bang();
	}

	function updateArg(key: string, value: unknown) {
		onchange?.({ ...args, [key]: value });
	}

	function handleInput(key: string, event: Event) {
		const target = event.target as HTMLInputElement;
		const argType = argTypes[key];
		const controlType = getControlType(key, argType);
		const currentValue = args[key];

		if (controlType === 'boolean') {
			updateArg(key, target.checked);
		} else if (controlType === 'number' || controlType === 'range') {
			updateArg(key, Number(target.value));
		} else if ((controlType === 'radio' || controlType === 'select') && typeof currentValue === 'number') {
			updateArg(key, Number(target.value));
		} else {
			updateArg(key, target.value);
		}
	}
</script>

{#if propNames.length > 0}
	<Table compact fixed borderless>
		<Table.Head>
			<Table.Row>
				<Table.Header width="15%">Name</Table.Header>
				<Table.Header width="18%">Type</Table.Header>
				<Table.Header width="12%">Default</Table.Header>
				<Table.Header width={isInteractive ? '25%' : '55%'}>Description</Table.Header>
				{#if isInteractive}
					<Table.Header width="30%">Control</Table.Header>
				{/if}
			</Table.Row>
		</Table.Head>
		<Table.Body>
			{#each propNames as name (name)}
				{@const argType = argTypes[name]}
				{@const controlType = getControlType(name, argType)}
				{@const options = getControlOptions(argType)}
				{@const config = getControlConfig(argType)}
				<Table.Row>
					<Table.Cell>
						<span class="prop-name">
							<code>{name}</code>
							{#if isRequired(argType)}
								<span class="required">*</span>
							{/if}
						</span>
					</Table.Cell>
					<Table.Cell>
						<code class="prop-type">{getTypeName(argType)}</code>
					</Table.Cell>
					<Table.Cell>
						<code class="prop-default">{getDefaultValue(name, argType)}</code>
					</Table.Cell>
					<Table.Cell>
						<span class="prop-description">{getDescription(argType)}</span>
					</Table.Cell>
					{#if isInteractive}
						<Table.Cell>
							<div class="prop-control">
								{#if controlType === false && isFunctionType(argType)}
									<Placeholder bind:this={bangRefs[name]} height="28px" radius={6} />
								{:else if controlType === false}
									<span class="no-control">-</span>
								{:else if controlType === 'boolean'}
									<Checkbox
										checked={Boolean(args[name])}
										size="s"
										onchange={(v) => updateArg(name, v)}
									/>
								{:else if controlType === 'select' && options}
									<select
										value={String(args[name])}
										onchange={(e) => handleInput(name, e)}
									>
										{#each options as option (option)}
											<option value={option} selected={String(args[name]) === option}>{option}</option>
										{/each}
									</select>
								{:else if controlType === 'radio' && options}
									<SegmentControl
										{options}
										value={String(args[name])}
										size="s"
										onchange={(v) => updateArg(name, typeof args[name] === 'number' ? Number(v) : v)}
									/>
								{:else if controlType === 'number'}
									<InputNumber
										value={Number(args[name])}
										min={config.min}
										max={config.max}
										step={config.step}
										size="s"
										oninput={(v) => updateArg(name, v)}
									/>
								{:else if controlType === 'range'}
									<div class="range-control">
										<input
											type="range"
											value={Number(args[name])}
											min={config.min ?? 0}
											max={config.max ?? 100}
											step={config.step ?? 1}
											oninput={(e) => handleInput(name, e)}
										/>
										<span class="range-value">{args[name]}</span>
									</div>
								{:else if controlType === 'color'}
									<input
										type="color"
										value={String(args[name])}
										oninput={(e) => handleInput(name, e)}
									/>
								{:else}
									<InputText
										value={String(args[name])}
										size="s"
										oninput={(v: string) => updateArg(name, v)}
									/>
								{/if}
							</div>
						</Table.Cell>
					{/if}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table>
{:else}
	<p class="no-props">No props defined</p>
{/if}

<style>
	.prop-name {
		white-space: nowrap;
	}

	.prop-name code {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--color-text);
		background: none;
		padding: 0;
	}

	.required {
		color: var(--danger-500);
		margin-left: 2px;
	}

	.prop-type {
		font-family: var(--font-mono);
		color: var(--pink-600);
		background: var(--pink-50);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
		white-space: nowrap;
	}

	.prop-default {
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		background: var(--color-bg-hover);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
		white-space: nowrap;
	}

	.prop-description {
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.no-props {
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	/* Control column */
	.prop-control {
		overflow: hidden;
	}

	.prop-control :global(input.InputText) {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}

	.prop-control input[type='color'] {
		width: 32px;
		height: 28px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		cursor: pointer;
		padding: 2px;
	}

	.prop-control select {
		width: 100%;
		max-width: 160px;
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font-size: 12px;
		font-family: var(--font-mono);
		background: var(--color-bg-elevated);
		color: var(--color-text);
		cursor: pointer;
	}

	.prop-control select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.range-control {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.range-control input[type='range'] {
		flex: 1;
		accent-color: var(--action-500);
	}

	.range-value {
		min-width: 32px;
		font-size: 12px;
		color: var(--color-text-secondary);
		font-weight: 500;
		text-align: right;
	}

	.no-control {
		color: var(--color-text-muted);
	}
</style>
