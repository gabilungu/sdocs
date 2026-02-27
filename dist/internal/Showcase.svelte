<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ArgType, CssProps, MethodType } from '../types.js';
	import PropsTable from './PropsTable.svelte';
	import CssPropsTable from './CssPropsTable.svelte';
	import MethodsTable from './MethodsTable.svelte';
	import { CodeBlock, CollapsiblePanel } from '../ui/index.js';
	import ComponentPreview from './ComponentPreview.svelte';

	interface Props {
		/** The render function for the component preview */
		render: Snippet<[Record<string, unknown>]>;
		/** Current args values */
		args: Record<string, unknown>;
		/** Arg type definitions for controls and props table */
		argTypes?: Record<string, ArgType>;
		/** CSS custom properties that can be set on the component */
		cssProps?: CssProps;
		/** Exported component methods */
		methods?: MethodType[];
		/** Callback when args change */
		onchange?: (args: Record<string, unknown>) => void;
		/** Optional source code to display */
		source?: string;
	}

	let {
		render,
		args,
		argTypes = {},
		cssProps,
		methods,
		onchange,
		source
	}: Props = $props();

	// State for CSS prop values
	let cssValues = $state<Record<string, string>>({});

	// Expand source to include CSS props when they're set
	let expandedSource = $derived.by(() => {
		if (!source) return source;

		const activeCssProps = Object.entries(cssValues).filter(([_, v]) => v);
		if (activeCssProps.length === 0) return source;

		// Build CSS props string with proper indentation
		const cssPropsStr = activeCssProps
			.map(([k, v]) => `\t${k}="${v}"`)
			.join('\n');

		// Insert before the closing /> (self-closing tag)
		return source.replace(/(\n?\t*)(\/>)/, `\n${cssPropsStr}$1$2`);
	});

	let propsTableRef: PropsTable | undefined;

	function isFunctionType(argType: ArgType): boolean {
		const typeName = typeof argType.type === 'string' ? argType.type : argType.type?.name ?? '';
		return typeName.includes('=>') || typeName.toLowerCase() === 'function' || typeName.startsWith('(');
	}

	// Create wrapper functions for function-type props that trigger bang in PropsTable
	let renderArgs = $derived.by(() => {
		const result = { ...args };
		for (const [name, argType] of Object.entries(argTypes)) {
			if (argType.control === false && isFunctionType(argType)) {
				result[name] = (...fnArgs: unknown[]) => {
					propsTableRef?.bangProp(name);
				};
			}
		}
		return result;
	});

	function handleArgsChange(newArgs: Record<string, unknown>) {
		onchange?.(newArgs);
	}

	function handleCssChange(newValues: Record<string, string>) {
		cssValues = newValues;
	}

	let hasProps = $derived(Object.keys(argTypes).length > 0);
	let hasCssProps = $derived(cssProps && Object.keys(cssProps).length > 0);
	let hasMethods = $derived(methods && methods.length > 0);
</script>

<div class="Showcase">
	<ComponentPreview cssVars={cssValues}>
		{@render render(renderArgs)}
	</ComponentPreview>

	{#if hasProps}
		<CollapsiblePanel title="Props" no_content_padding>
			<PropsTable bind:this={propsTableRef} {argTypes} {args} onchange={onchange ? handleArgsChange : undefined} />
		</CollapsiblePanel>
	{/if}

	{#if hasCssProps && cssProps}
		<CollapsiblePanel title="CSS Props" no_content_padding>
			<CssPropsTable {cssProps} values={cssValues} onchange={handleCssChange} />
		</CollapsiblePanel>
	{/if}

	{#if hasMethods && methods}
		<CollapsiblePanel title="Methods" no_content_padding>
			<MethodsTable {methods} />
		</CollapsiblePanel>
	{/if}

	{#if expandedSource}
		<CollapsiblePanel title="Code" open={false} no_content_padding>
			<CodeBlock code={expandedSource} />
		</CollapsiblePanel>
	{/if}
</div>

<style>
	.Showcase {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--color-border);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
		overflow: hidden;
	}
</style>
