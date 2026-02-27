<script lang="ts">
	import type { CssProps, CssControlType } from '../types.js';
	import { Table } from '../ui/index.js';

	interface Props {
		cssProps: CssProps;
		/** Current CSS values (for interactive mode) */
		values?: Record<string, string>;
		/** Callback when values change (enables interactive mode) */
		onchange?: (values: Record<string, string>) => void;
	}

	let { cssProps, values = {}, onchange }: Props = $props();

	// Get sorted CSS prop names
	let propNames = $derived(Object.keys(cssProps).sort());

	// Check if we're in interactive mode
	let isInteractive = $derived(!!onchange);

	function getControlType(control: CssProps[string]['control']): CssControlType {
		if (!control) return 'color'; // default
		if (typeof control === 'string') return control;
		return control.type;
	}

	function getOptions(control: CssProps[string]['control']): string[] {
		if (typeof control === 'object' && control.options) return control.options;
		return [];
	}

	function updateValue(key: string, value: string) {
		onchange?.({ ...values, [key]: value });
	}

	function handleInput(key: string, event: Event) {
		const target = event.target as HTMLInputElement | HTMLSelectElement;
		updateValue(key, target.value);
	}
</script>

{#if propNames.length > 0}
	<Table compact borderless>
		<Table.Head>
			<Table.Row>
				<Table.Header>Name</Table.Header>
				<Table.Header>Type</Table.Header>
				<Table.Header>Default</Table.Header>
				<Table.Header>Description</Table.Header>
				{#if isInteractive}
					<Table.Header>Control</Table.Header>
				{/if}
			</Table.Row>
		</Table.Head>
		<Table.Body>
			{#each propNames as name (name)}
				{@const cssProp = cssProps[name]}
				{@const controlType = getControlType(cssProp.control)}
				{@const currentValue = values[name] || cssProp.default || ''}
				{@const hasControl = cssProp.control !== false}
				<Table.Row>
					<Table.Cell>
						<span class="css-name"><code>{name}</code></span>
					</Table.Cell>
					<Table.Cell>
						<code class="css-type">{controlType}</code>
					</Table.Cell>
					<Table.Cell>
						<code class="css-default">{cssProp.default ?? '-'}</code>
					</Table.Cell>
					<Table.Cell>
						<span class="css-description">{cssProp.description ?? '-'}</span>
					</Table.Cell>
					{#if isInteractive}
						<Table.Cell>
							<div class="css-control">
								{#if hasControl}
									{#if controlType === 'color'}
										<div class="css-control-color">
											<input
												type="color"
												value={currentValue || '#888888'}
												oninput={(e) => handleInput(name, e)}
											/>
											<span class="css-control-value">{currentValue || '-'}</span>
										</div>
									{:else if controlType === 'select'}
										<select
											value={currentValue}
											onchange={(e) => handleInput(name, e)}
										>
											{#each getOptions(cssProp.control) as option}
												<option value={option}>{option}</option>
											{/each}
										</select>
									{:else if controlType === 'number'}
										<input
											type="number"
											value={currentValue}
											oninput={(e) => handleInput(name, e)}
										/>
									{:else}
										<!-- text, length, or fallback -->
										<input
											type="text"
											value={currentValue}
											placeholder={controlType === 'length' ? '16px, 1rem' : ''}
											oninput={(e) => handleInput(name, e)}
										/>
									{/if}
								{:else}
									<span class="no-control">-</span>
								{/if}
							</div>
						</Table.Cell>
					{/if}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table>
{:else}
	<p class="css-empty">No CSS props defined</p>
{/if}

<style>
	.css-name {
		white-space: nowrap;
	}

	.css-name code {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--color-text);
		background: none;
		padding: 0;
	}

	.css-type {
		font-family: var(--font-mono);
		color: var(--sky-600);
		background: var(--sky-50);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
	}

	.css-default {
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		background: var(--color-bg-hover);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
	}

	.css-description {
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.css-empty {
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	/* Control column styles */
	.css-control {
		min-width: 140px;
	}

	.css-control-color {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.css-control input[type='color'] {
		width: 32px;
		height: 28px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		cursor: pointer;
		padding: 2px;
		flex-shrink: 0;
	}

	.css-control-value {
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.css-control input[type='text'],
	.css-control input[type='number'] {
		width: 100%;
		max-width: 140px;
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font-size: 12px;
		font-family: var(--font-mono);
		background: var(--color-bg-elevated);
		color: var(--color-text);
	}

	.css-control input[type='text']:focus,
	.css-control input[type='number']:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.css-control select {
		width: 100%;
		max-width: 140px;
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

	.css-control select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.no-control {
		color: var(--color-text-muted);
	}
</style>
