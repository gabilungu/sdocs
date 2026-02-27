<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import ControlsPanel from './ControlsPanel.svelte';
	import DataTable from './DataTable.svelte';

	interface Props {
		doc: DocEntry;
		/** If set, show only this example (full-page view) */
		snippetName?: string;
		activeStylesheet?: string;
	}

	let { doc, snippetName, activeStylesheet }: Props = $props();

	const meta = $derived(doc.meta);
	const cd = $derived(doc.componentData);
	const componentName = $derived(
		typeof meta.component === 'string'
			? meta.component
			: (meta.title ?? '').split('/').pop()?.trim() ?? 'Component',
	);
	const snippets = $derived(doc.snippets ?? []);
	const defaultSnippet = $derived(snippets.find((s) => s.name === 'Default'));
	const exampleSnippets = $derived(snippets.filter((s) => s.name !== 'Default'));
	const focusedSnippet = $derived(snippetName ? snippets.find((s) => s.name === snippetName) : null);

	// Props/CSS controls state
	let propValues = $state<Record<string, unknown>>({});
	let cssValues = $state<Record<string, string>>({});

	// Initialize from meta.args (build new objects to avoid read+write loop)
	$effect(() => {
		propValues = { ...(meta.args ?? {}) };
		const newCss: Record<string, string> = {};
		if (cd?.cssProps) {
			for (const cp of cd.cssProps) {
				if (cp.default) newCss[cp.name] = cp.default;
			}
		}
		cssValues = newCss;
	});

	function handlePropChange(name: string, value: unknown) {
		propValues = { ...propValues, [name]: value };
	}

	function handleCssChange(name: string, value: string) {
		cssValues = { ...cssValues, [name]: value };
	}

	function generateUsageCode(name: string, props: Record<string, unknown>, css: Record<string, string>): string {
		const attrs: string[] = [];
		for (const [key, value] of Object.entries(props)) {
			if (value === undefined || value === null || value === '') continue;
			if (typeof value === 'string') {
				attrs.push(`${key}="${value}"`);
			} else if (typeof value === 'boolean') {
				attrs.push(value ? key : `${key}={false}`);
			} else {
				attrs.push(`${key}={${JSON.stringify(value)}}`);
			}
		}
		for (const [key, value] of Object.entries(css)) {
			if (value === undefined || value === '') continue;
			attrs.push(`${key}="${value}"`);
		}
		if (attrs.length === 0) return `<${name} />`;
		if (attrs.length <= 2) return `<${name} ${attrs.join(' ')} />`;
		return `<${name}\n  ${attrs.join('\n  ')}\n/>`;
	}

	const usageCode = $derived(generateUsageCode(componentName, propValues, cssValues));

	function handleReset() {
		propValues = { ...(meta.args ?? {}) };
		const newCss: Record<string, string> = {};
		if (cd?.cssProps) {
			for (const cp of cd.cssProps) {
				if (cp.default) newCss[cp.name] = cp.default;
			}
		}
		cssValues = newCss;
	}

	// Table data builders
	const propsRows = $derived(
		(cd?.props ?? []).filter((p) => p.category === 'prop').map((p) => ({
			name: p.name,
			type: p.type,
			default: p.default,
			required: p.required ? 'Yes' : '',
			description: p.description,
		})),
	);

	const cssPropsRows = $derived(
		(cd?.cssProps ?? []).map((p) => ({
			name: p.name,
			type: p.type,
			default: p.default,
			description: p.description,
		})),
	);

	const eventsRows = $derived(
		(cd?.props ?? []).filter((p) => p.category === 'event').map((p) => ({
			name: p.name,
			type: p.type,
			description: p.description,
		})),
	);

	const snippetsRows = $derived(
		(cd?.props ?? []).filter((p) => p.category === 'snippet').map((p) => ({
			name: p.name,
			type: p.type,
			description: p.description,
		})),
	);

	const methodsRows = $derived(
		(cd?.methods ?? []).map((m) => ({
			name: m.name,
			params: m.params,
			returns: m.returnType,
			description: m.description,
		})),
	);

	const stateRows = $derived(
		(cd?.state ?? []).map((s) => ({
			name: s.name,
			type: s.type,
			description: s.description,
		})),
	);
</script>

<div class="sdocs-component-view">
	{#if focusedSnippet}
		<!-- Example full-page view -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{meta.title} / {snippetName}</h1>
		</div>
		<div class="sdocs-panels">
			<CollapsiblePanel title="Preview">
				<PreviewFrame src={focusedSnippet.previewUrl} {activeStylesheet} />
			</CollapsiblePanel>
			<CollapsiblePanel title="Code" defaultExpanded={false}>
				<div class="sdocs-code-block">{@html focusedSnippet.highlightedHtml ?? ''}</div>
			</CollapsiblePanel>
		</div>
	{:else}
		<!-- Full component view -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{meta.title}</h1>
			{#if meta.description}
				<p class="sdocs-view-description">{meta.description}</p>
			{/if}
		</div>

		<div class="sdocs-panels">
			<!-- Showcase -->
			{#if defaultSnippet}
				<CollapsiblePanel title="Preview">
					<PreviewFrame
						src={defaultSnippet.previewUrl}
						props={propValues}
						cssVars={cssValues}
						{activeStylesheet}
					/>
				</CollapsiblePanel>

				<CollapsiblePanel title="Preview Code">
					<div class="sdocs-code-block"><pre><code>{usageCode}</code></pre></div>
				</CollapsiblePanel>
			{/if}

			{#if cd && ((cd.props.filter((p) => p.category === 'prop').length > 0) || cd.cssProps.length > 0)}
				<CollapsiblePanel title="Controls">
					<ControlsPanel
						componentProps={cd.props}
						cssProps={cd.cssProps}
						{propValues}
						{cssValues}
						onPropChange={handlePropChange}
						onCssChange={handleCssChange}
						onReset={handleReset}
					/>
				</CollapsiblePanel>
			{/if}

			<CollapsiblePanel title="Props">
				<DataTable
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'type', label: 'Type' },
						{ key: 'default', label: 'Default' },
						{ key: 'required', label: 'Required' },
						{ key: 'description', label: 'Description' },
					]}
					rows={propsRows}
				/>
			</CollapsiblePanel>

			<CollapsiblePanel title="CSS Props">
				<DataTable
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'type', label: 'Type' },
						{ key: 'default', label: 'Default' },
						{ key: 'description', label: 'Description' },
					]}
					rows={cssPropsRows}
				/>
			</CollapsiblePanel>

			<CollapsiblePanel title="Events">
				<DataTable
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'type', label: 'Type' },
						{ key: 'description', label: 'Description' },
					]}
					rows={eventsRows}
				/>
			</CollapsiblePanel>

			<CollapsiblePanel title="Snippets">
				<DataTable
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'type', label: 'Type' },
						{ key: 'description', label: 'Description' },
					]}
					rows={snippetsRows}
				/>
			</CollapsiblePanel>

			<CollapsiblePanel title="Methods">
				<DataTable
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'params', label: 'Parameters' },
						{ key: 'returns', label: 'Returns' },
						{ key: 'description', label: 'Description' },
					]}
					rows={methodsRows}
				/>
			</CollapsiblePanel>

			<CollapsiblePanel title="State">
				<DataTable
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'type', label: 'Type' },
						{ key: 'description', label: 'Description' },
					]}
					rows={stateRows}
				/>
			</CollapsiblePanel>

			<!-- Examples -->
			{#if exampleSnippets.length > 0}
				<h2 class="sdocs-section-title">Examples</h2>
				{#each exampleSnippets as example (example.name)}
					<div class="sdocs-example">
						<h3 class="sdocs-example-title">{example.name}</h3>
						<CollapsiblePanel title="Preview">
							<PreviewFrame src={example.previewUrl} {activeStylesheet} />
						</CollapsiblePanel>
						<CollapsiblePanel title="Code" defaultExpanded={false}>
							<div class="sdocs-code-block">{@html example.highlightedHtml ?? ''}</div>
						</CollapsiblePanel>
					</div>
				{/each}
			{/if}

			<!-- Source -->
			{#if doc.highlightedSource}
				<CollapsiblePanel title="Component Source" defaultExpanded={false}>
					<div class="sdocs-code-block">{@html doc.highlightedSource}</div>
				</CollapsiblePanel>
			{/if}
		</div>
	{/if}
</div>

<style>
	.sdocs-component-view {
		padding: 24px 32px;
		max-width: 960px;
		font-family: var(--sans);
	}
	.sdocs-view-header {
		margin-bottom: 24px;
	}
	.sdocs-view-title {
		font-size: 24px;
		font-weight: 700;
		color: var(--color-base-900);
		margin: 0;
	}
	.sdocs-view-description {
		font-size: 14px;
		color: var(--color-base-500);
		margin: 6px 0 0;
	}
	.sdocs-panels {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sdocs-section-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--color-base-900);
		margin: 24px 0 8px;
	}
	.sdocs-example {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sdocs-example-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--color-base-800);
		margin: 0;
	}
	.sdocs-code-block {
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
	}
	.sdocs-code-block :global(pre) {
		margin: 0;
		padding: 12px;
		border-radius: 6px;
		overflow-x: auto;
	}
	.sdocs-code-block :global(code) {
		font-family: var(--mono);
	}
</style>
