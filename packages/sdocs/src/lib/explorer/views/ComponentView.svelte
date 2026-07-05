<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import { highlightSvelte } from '../highlighter.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import ApiTable from './ApiTable.svelte';
	import PropControl from './PropControl.svelte';
	import CssPropControl from './CssPropControl.svelte';
	import { displayTitle } from '../tree-builder.js';

	interface Props {
		doc: DocEntry;
		/** If set, show only this example (full-page view) */
		snippetName?: string;
		activeStylesheet?: string;
	}

	let { doc, snippetName, activeStylesheet }: Props = $props();

	const meta = $derived(doc.meta);
	const previews = $derived(doc.previews ?? []);

	// Active preview tab (one full live panel per preview)
	let activeIndex = $state(0);
	$effect(() => {
		doc;
		activeIndex = 0;
	});
	const activePreview = $derived(
		previews.length > 0 ? previews[Math.min(activeIndex, previews.length - 1)] : undefined,
	);

	const cd = $derived(activePreview?.componentData ?? null);
	const componentName = $derived(
		activePreview?.componentName ??
			((meta.title ?? '').split('/').pop()?.trim() || 'Component'),
	);
	const exampleSnippets = $derived(doc.examples ?? []);
	const focusedSnippet = $derived(
		snippetName ? exampleSnippets.find((s) => s.name === snippetName) : null,
	);

	// Props/CSS controls state
	let propValues = $state<Record<string, unknown>>({});
	let cssValues = $state<Record<string, string>>({});

	// Live wiring to the active preview: method invocation + exported state values
	let defaultPreview = $state<{ callMethod: (name: string) => void }>();
	let liveStateValues = $state<Record<string, unknown>>({});

	// Initialize from the active preview's args (build new objects to avoid
	// read+write loop); re-runs on doc and tab change.
	$effect(() => {
		propValues = { ...(activePreview?.args ?? {}) };
		const newCss: Record<string, string> = {};
		if (cd?.cssProps) {
			for (const cp of cd.cssProps) {
				if (cp.default) newCss[cp.name] = cp.default;
			}
		}
		cssValues = newCss;
		liveStateValues = {};
	});

	function handlePropChange(name: string, value: unknown) {
		propValues = { ...propValues, [name]: value };
	}

	function handleCssChange(name: string, value: string) {
		cssValues = { ...cssValues, [name]: value };
	}

	function formatAttr(name: string, value: unknown): string {
		if (typeof value === 'string') return `${name}="${value}"`;
		if (typeof value === 'boolean') return value ? name : `${name}={false}`;
		return `${name}={${JSON.stringify(value)}}`;
	}

	function generateFallbackCode(name: string, props: Record<string, unknown>, css: Record<string, string>): string {
		const attrs: string[] = [];
		for (const [key, value] of Object.entries(props)) {
			if (value === undefined || value === null || value === '') continue;
			attrs.push(formatAttr(key, value));
		}
		for (const [key, value] of Object.entries(css)) {
			if (value === undefined || value === '') continue;
			attrs.push(`${key}="${value}"`);
		}
		if (attrs.length === 0) return `<${name} />`;
		if (attrs.length <= 2) return `<${name} ${attrs.join(' ')} />`;
		return `<${name}\n  ${attrs.join('\n  ')}\n/>`;
	}

	/**
	 * Patch the Default snippet body with prop/CSS changes from Controls.
	 * Finds the root component opening tag and updates/adds changed attributes.
	 */
	function patchSnippetCode(
		snippetBody: string,
		name: string,
		currentProps: Record<string, unknown>,
		currentCss: Record<string, string>,
		initialProps: Record<string, unknown>,
		initialCss: Record<string, string>,
	): string {
		// Collect only changed props/css
		const changes: [string, unknown][] = [];
		for (const [key, value] of Object.entries(currentProps)) {
			if (JSON.stringify(value) !== JSON.stringify(initialProps[key])) {
				changes.push([key, value]);
			}
		}
		for (const [key, value] of Object.entries(currentCss)) {
			if (value !== (initialCss[key] ?? '')) {
				changes.push([key, value]);
			}
		}

		if (changes.length === 0) return snippetBody;

		// Find the opening tag: <ComponentName ...> or <ComponentName ... />
		// (whole-name match, so <Tab doesn't hit <Tabs)
		const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
		const tagMatch = snippetBody.match(new RegExp(`<${escapedName}(?=[\\s/>])`));
		if (!tagMatch || tagMatch.index === undefined) return snippetBody;
		const tagStart = tagMatch.index;

		// Find the end of the opening tag, respecting {} expressions
		let braceDepth = 0;
		let tagEnd = -1;
		for (let i = tagStart + name.length + 1; i < snippetBody.length; i++) {
			if (snippetBody[i] === '{') braceDepth++;
			else if (snippetBody[i] === '}') braceDepth--;
			else if (braceDepth === 0 && snippetBody[i] === '>') {
				tagEnd = i;
				break;
			}
		}
		if (tagEnd === -1) return snippetBody;

		const isSelfClosing = snippetBody[tagEnd - 1] === '/';
		const attrsStart = tagStart + `<${name}`.length;
		const attrsEnd = isSelfClosing ? tagEnd - 1 : tagEnd;
		let attrs = snippetBody.slice(attrsStart, attrsEnd);

		for (const [attrName, value] of changes) {
			const formatted = formatAttr(attrName, value);
			const escaped = attrName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

			// Try replacing existing: name="...", name={...}, or bare name
			const patterns = [
				new RegExp(`(\\s)${escaped}="[^"]*"`),
				new RegExp(`(\\s)${escaped}=\\{[^}]*\\}`),
				new RegExp(`(\\s)${escaped}(?=\\s|$)`),
			];

			let replaced = false;
			for (const pattern of patterns) {
				if (pattern.test(attrs)) {
					attrs = attrs.replace(pattern, `$1${formatted}`);
					replaced = true;
					break;
				}
			}

			if (!replaced) {
				attrs += ` ${formatted}`;
			}
		}

		const closing = isSelfClosing ? '/>' : '>';
		return snippetBody.slice(0, attrsStart) + attrs + closing + snippetBody.slice(tagEnd + 1);
	}

	// Initial values for diffing (computed once per doc/tab change)
	const initialProps = $derived(activePreview?.args ?? {});
	const initialCss = $derived.by(() => {
		const css: Record<string, string> = {};
		if (cd?.cssProps) {
			for (const cp of cd.cssProps) {
				if (cp.default) css[cp.name] = cp.default;
			}
		}
		return css;
	});

	const usageCode = $derived.by(() => {
		if (activePreview?.snippet.body) {
			return patchSnippetCode(activePreview.snippet.body, componentName, propValues, cssValues, initialProps, initialCss);
		}
		return generateFallbackCode(componentName, propValues, cssValues);
	});

	// Usage code is generated in the browser, so it's highlighted client-side
	// (lazy Shiki — see ../highlighter.ts). Debounced while controls change;
	// stale results are dropped.
	let highlightedUsageHtml = $state('');
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const code = usageCode;
		clearTimeout(highlightTimer);
		highlightTimer = setTimeout(async () => {
			try {
				const html = await highlightSvelte(code);
				if (code === usageCode) highlightedUsageHtml = html;
			} catch {
				highlightedUsageHtml = '';
			}
		}, 150);
	});

	function handleReset() {
		propValues = { ...(activePreview?.args ?? {}) };
		const newCss: Record<string, string> = {};
		if (cd?.cssProps) {
			for (const cp of cd.cssProps) {
				if (cp.default) newCss[cp.name] = cp.default;
			}
		}
		cssValues = newCss;
	}

	const hasEditableControls = $derived(
		!!cd && (cd.props.some((p) => p.category === 'prop') || cd.cssProps.length > 0),
	);

	// Table data builders
	const propsRows = $derived(
		(cd?.props ?? []).filter((p) => p.category === 'prop').map((p) => ({
			name: p.name,
			type: p.type,
			default: p.default,
			required: p.required,
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
			type: `(${m.params ?? ''}) => ${m.returnType || 'void'}`,
			params: m.params,
			description: m.description,
		})),
	);

	const stateRows = $derived(
		(cd?.state ?? []).map((s) => ({
			default: s.name in liveStateValues ? JSON.stringify(liveStateValues[s.name]) : undefined,
			name: s.name,
			type: s.type,
			description: s.description,
		})),
	);

	// The Reset button normally sits in the Props header; when a component has
	// editable CSS vars but no regular props, that section is hidden, so show
	// Reset in the CSS Props header instead.
	const showResetInCss = $derived(
		hasEditableControls && propsRows.length === 0 && cssPropsRows.length > 0,
	);
</script>

<div class="sdocs-component-view" style:max-width={doc.maxWidth}>
	{#if focusedSnippet}
		<!-- Example full-page view -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{displayTitle(meta.title)} / {snippetName}</h1>
		</div>
		<div class="sdocs-panels">
			<CollapsiblePanel title="Preview">
				<PreviewFrame src={focusedSnippet.previewUrl ?? ''} {activeStylesheet} />
			</CollapsiblePanel>
			<CollapsiblePanel title="Code" defaultExpanded={false}>
				<div class="sdocs-code-block">{@html focusedSnippet.highlightedHtml ?? ''}</div>
			</CollapsiblePanel>
		</div>
	{:else}
		<!-- Full component view -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
			{#if meta.description}
				<p class="sdocs-view-description">{meta.description}</p>
			{/if}
		</div>

		{#if previews.length > 1}
			<div class="sdocs-preview-tabs" role="tablist">
				{#each previews as preview, i (preview.snippet.slug)}
					<button
						class="sdocs-preview-tab"
						class:active={i === activeIndex}
						role="tab"
						aria-selected={i === activeIndex}
						onclick={() => (activeIndex = i)}
					>
						{preview.label}
					</button>
				{/each}
			</div>
		{/if}

		<div class="sdocs-panels">
			<!-- Showcase -->
			{#if activePreview}
				{#key activePreview.snippet.slug}
					<div class="sdocs-preview-wrapper">
						<PreviewFrame
							bind:this={defaultPreview}
							src={activePreview.snippet.previewUrl ?? ''}
							props={propValues}
							cssVars={cssValues}
							{activeStylesheet}
							onStateValues={(values) => (liveStateValues = values)}
						/>
					</div>
				{/key}

				<CollapsiblePanel title="Preview Code" defaultExpanded={false}>
					<div class="sdocs-code-block">
						{#if highlightedUsageHtml}
							{@html highlightedUsageHtml}
						{:else}
							<pre><code>{usageCode}</code></pre>
						{/if}
					</div>
				</CollapsiblePanel>
			{/if}
		</div>

		{#snippet propControl(row: Record<string, unknown>)}
			{@const prop = cd?.props.find((p) => p.name === row.name && p.category === 'prop')}
			{#if prop}
				<PropControl {prop} value={propValues[prop.name]} onchange={(v) => handlePropChange(prop.name, v)} />
			{/if}
		{/snippet}

		{#snippet methodControl(row: Record<string, unknown>)}
			{@const hasParams = String(row.params ?? '').trim().length > 0}
			<button
				class="sdocs-run-btn"
				disabled={hasParams || !defaultPreview}
				title={hasParams ? 'Only methods without parameters can be run here' : `Run ${row.name}() on the preview`}
				onclick={() => defaultPreview?.callMethod(String(row.name))}
			>
				Run
			</button>
		{/snippet}

		{#snippet cssPropControl(row: Record<string, unknown>)}
			{@const cssProp = cd?.cssProps.find((p) => p.name === row.name)}
			{#if cssProp}
				<CssPropControl {cssProp} value={cssValues[cssProp.name]} onchange={(v) => handleCssChange(cssProp.name, v)} />
			{/if}
		{/snippet}

		{#if propsRows.length > 0}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="sliders-horizontal" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					Props
					{#if hasEditableControls}
						<button class="sdocs-reset-btn" onclick={handleReset}>Reset</button>
					{/if}
				</h2>
				<ApiTable rows={propsRows} control={propControl} />
			</section>
		{/if}

		{#if cssPropsRows.length > 0}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="palette" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					CSS Props
					{#if showResetInCss}
						<button class="sdocs-reset-btn" onclick={handleReset}>Reset</button>
					{/if}
				</h2>
				<ApiTable rows={cssPropsRows} control={cssPropControl} />
			</section>
		{/if}

		{#if eventsRows.length > 0}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="zap" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					Events
				</h2>
				<ApiTable rows={eventsRows} showDefault={false} />
			</section>
		{/if}

		{#if snippetsRows.length > 0}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="code" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					Snippets
				</h2>
				<ApiTable rows={snippetsRows} showDefault={false} />
			</section>
		{/if}

		{#if methodsRows.length > 0}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="square-function" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					Methods
				</h2>
				<ApiTable rows={methodsRows} showDefault={false} control={methodControl} />
			</section>
		{/if}

		{#if stateRows.length > 0}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="database" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					States
				</h2>
				<ApiTable rows={stateRows} defaultLabel="Current value" />
			</section>
		{/if}

		{#if exampleSnippets.length > 0}
			<hr class="sdocs-divider" />
			<h2 class="sdocs-section-title">Examples</h2>
			{#each exampleSnippets as example (example.name)}
				<div class="sdocs-example">
					<h3 class="sdocs-example-title">
						<Icon name="bookmark" --w="14px" --h="14px" --fill="var(--color-example-500)" />
						{example.name}
					</h3>
					<div class="sdocs-panels">
						<div class="sdocs-preview-wrapper">
							<PreviewFrame src={example.previewUrl ?? ''} {activeStylesheet} />
						</div>
						<CollapsiblePanel title="Code" defaultExpanded={false}>
							<div class="sdocs-code-block">{@html example.highlightedHtml ?? ''}</div>
						</CollapsiblePanel>
					</div>
				</div>
			{/each}
		{/if}

		{#if activePreview?.highlightedSource}
			<hr class="sdocs-divider" />
			<div class="sdocs-panels">
				<CollapsiblePanel title="Component Source" defaultExpanded={false}>
					<div class="sdocs-code-block">{@html activePreview.highlightedSource}</div>
				</CollapsiblePanel>
			</div>
		{/if}
	{/if}
</div>

<style>
	.sdocs-component-view {
		padding: 24px 32px;
		/* max-width comes from the doc entry (config/entity cascade) */
		font-family: var(--sans);
	}
	.sdocs-doc-section {
		margin-top: 28px;
	}
	.sdocs-doc-section-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 10px;
		font-size: 14px;
		font-weight: 600;
		color: var(--color-base-800);
	}
	.sdocs-doc-section-title .sdocs-reset-btn {
		margin-left: auto;
	}
	.sdocs-reset-btn {
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
	.sdocs-run-btn {
		padding: 3px 12px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		font: inherit;
		font-size: 12px;
		color: var(--color-base-600);
		cursor: pointer;
	}
	.sdocs-run-btn:hover:not(:disabled) {
		background: var(--color-base-100);
	}
	.sdocs-run-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.sdocs-preview-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 12px;
		border-bottom: 1px solid var(--color-base-200);
	}
	.sdocs-preview-tab {
		padding: 7px 14px;
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-base-500);
		cursor: pointer;
	}
	.sdocs-preview-tab:hover {
		color: var(--color-base-800);
	}
	.sdocs-preview-tab.active {
		color: var(--color-base-900);
		border-bottom-color: var(--color-accent-500, var(--color-base-900));
		font-weight: 600;
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
		gap: 1px;
		border: 1px solid var(--color-base-200);
		background: var(--color-base-200);
		border-radius: 8px;
		overflow: hidden;
	}
	.sdocs-preview-wrapper {
		/* stage padding lives inside the iframe (config/entity/block cascade) */
		background: var(--color-base-0);
	}
	.sdocs-divider {
		border: none;
		border-top: 1px solid var(--color-base-200);
		margin: 24px 0;
	}
	.sdocs-section-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--color-base-900);
		margin: 24px 0 16px;
	}
	.sdocs-example + .sdocs-example {
		margin-top: 16px;
	}
	.sdocs-example {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sdocs-example-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 15px;
		font-weight: 600;
		color: var(--color-base-800);
		margin: 0;
	}
	.sdocs-code-block {
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
		tab-size: 4;
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
