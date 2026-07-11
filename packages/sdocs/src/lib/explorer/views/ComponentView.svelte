<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import { highlightSvelte } from '../highlighter.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import ApiTable from './ApiTable.svelte';
	import PropControl from './PropControl.svelte';
	import CssPropControl from './CssPropControl.svelte';
	import {
		generateFallbackCode,
		patchSnippetCode,
		resolveArgsInCode,
	} from './usage-code.js';
	import { renderInlineMarkdown } from './format.js';
	import { displayTitle } from '../tree-builder.js';
	import { getQueryParam, setQueryParam } from '../router.svelte.js';

	interface Props {
		doc: DocEntry;
		/** If set, show only this example (full-page view) */
		snippetName?: string;
		activeStylesheet?: string;
	}

	let { doc, snippetName, activeStylesheet }: Props = $props();

	const meta = $derived(doc.meta);
	const previews = $derived(doc.previews ?? []);

	// Active preview tab (one full live panel per preview). The selection is
	// mirrored in the URL as ?tab=<preview-slug> so a tab is shareable; this
	// effect syncs the other way — reset to 0 on entity change, or select the
	// preview named by the query param. It runs after mount, so the first
	// (hydration) render still matches the prerendered default tab.
	let activeIndex = $state(0);
	$effect(() => {
		doc; // re-run when the entity changes
		const slug = getQueryParam('tab');
		const idx = slug ? previews.findIndex((p) => p.snippet.slug === slug) : -1;
		activeIndex = idx >= 0 ? idx : 0;
	});

	/** Switch tab and reflect it in the URL (tab 0 is the default → clean URL). */
	function selectTab(i: number) {
		activeIndex = i;
		setQueryParam('tab', i === 0 ? null : (previews[i]?.snippet.slug ?? null));
	}
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
	let defaultPreview = $state<{
		callMethod: (name: string) => void;
		resolveColor: (value: string) => string | null;
	}>();

	// Computed colors for var() defaults, resolved in the preview iframe —
	// the only document where the project's theme css is loaded.
	let resolvedColors = $state<Record<string, string>>({});

	function resolveVarColors() {
		const out: Record<string, string> = {};
		for (const cp of cd?.cssProps ?? []) {
			if (cp.type?.toLowerCase() === 'color' && cp.default?.startsWith('var(')) {
				const hex = defaultPreview?.resolveColor(cp.default);
				if (hex) out[cp.name] = hex;
			}
		}
		resolvedColors = out;
	}
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

	// Unset: the prop leaves args entirely, so the component renders its own
	// default (an empty string stays a real value — only ✕ unsets).
	function handlePropUnset(name: string) {
		const next = { ...propValues };
		delete next[name];
		propValues = next;
	}

	function handleCssChange(name: string, value: string) {
		cssValues = { ...cssValues, [name]: value };
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

	// Only user-changed vars reach the stage. Custom properties inherit, so a
	// seeded default applied to the stage would cascade into nested components
	// that read the same var name and override their own fallbacks — the
	// component's real default must come from its own var() fallback instead.
	const appliedCss = $derived.by(() => {
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(cssValues)) {
			if (value !== (initialCss[key] ?? '')) out[key] = value;
		}
		return out;
	});

	const usageCode = $derived.by(() => {
		if (activePreview?.snippet.body) {
			const resolved = resolveArgsInCode(activePreview.snippet.body, propValues);
			return patchSnippetCode(resolved, componentName, propValues, cssValues, initialProps, initialCss);
		}
		return generateFallbackCode(componentName, propValues, appliedCss);
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
			defaultUses: p.defaultUses,
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
			<!-- The example IS the page — its stage renders directly, no accordion. -->
			<div class="sdocs-preview-wrapper">
				<PreviewFrame src={focusedSnippet.previewUrl ?? ''} {activeStylesheet} />
			</div>
			<CollapsiblePanel title="Code" defaultExpanded={false} flush>
				<div class="sdocs-code-block">{@html focusedSnippet.highlightedHtml ?? ''}</div>
			</CollapsiblePanel>
		</div>
	{:else}
		<!-- Full component view -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
			{#if meta.description}
				<p class="sdocs-view-description">{@html renderInlineMarkdown(meta.description)}</p>
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
						onclick={() => selectTab(i)}
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
					{#if activePreview.snippet.description}
						<p class="sdocs-block-description">{@html renderInlineMarkdown(activePreview.snippet.description)}</p>
					{/if}
					<div class="sdocs-preview-wrapper">
						<PreviewFrame
							bind:this={defaultPreview}
							src={activePreview.snippet.previewUrl ?? ''}
							props={propValues}
							cssVars={appliedCss}
							{activeStylesheet}
							onStateValues={(values) => (liveStateValues = values)}
							onready={resolveVarColors}
						/>
					</div>
				{/key}

				<CollapsiblePanel title="Preview Code" defaultExpanded={false} flush>
					<div class="sdocs-code-block">
						{#if highlightedUsageHtml}
							{@html highlightedUsageHtml}
						{:else}
							<pre><code>{usageCode}</code></pre>
						{/if}
					</div>
				</CollapsiblePanel>

				{#if activePreview.highlightedSource}
					<CollapsiblePanel title="Component Source" defaultExpanded={false} flush>
						<div class="sdocs-code-block">{@html activePreview.highlightedSource}</div>
					</CollapsiblePanel>
				{/if}
			{/if}
		</div>

		{#snippet propControl(row: Record<string, unknown>)}
			{@const prop = cd?.props.find((p) => p.name === row.name && p.category === 'prop')}
			{#if prop}
				<PropControl
					{prop}
					value={propValues[prop.name]}
					onchange={(v) => handlePropChange(prop.name, v)}
					onunset={() => handlePropUnset(prop.name)}
				/>
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
				<CssPropControl
					{cssProp}
					value={cssValues[cssProp.name]}
					resolvedColor={resolvedColors[cssProp.name]}
					onchange={(v) => handleCssChange(cssProp.name, v)}
				/>
			{/if}
		{/snippet}

		{#if propsRows.length > 0 || cd?.acceptsClass || cd?.forwardsRest}
			<section class="sdocs-doc-section">
				<h2 class="sdocs-doc-section-title">
					<Icon name="sliders-horizontal" --w="15px" --h="15px" --fill="var(--color-base-500)" />
					Props
					{#if hasEditableControls}
						<button class="sdocs-reset-btn" onclick={handleReset}>Reset</button>
					{/if}
				</h2>
				{#if propsRows.length > 0}
					<ApiTable rows={propsRows} control={propControl} />
				{/if}
				{#if cd?.acceptsClass || cd?.forwardsRest}
					<!-- class / ...rest are forwarding infrastructure, not API — chips, not rows -->
					<div class="sdocs-forwarded">
						<span class="sdocs-forwarded-label">Also forwarded to the root element:</span>
						{#if cd?.acceptsClass}<code class="sdocs-forwarded-chip">class</code>{/if}
						{#if cd?.forwardsRest}
							<code class="sdocs-forwarded-chip" title={cd?.restType ?? undefined}>{cd?.restType ? `…rest (${cd.restType})` : '…rest'}</code>
						{/if}
					</div>
				{/if}
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
						{example.name || '⚠ title required'}
					</h3>
					{#if example.description}
						<p class="sdocs-block-description">{@html renderInlineMarkdown(example.description)}</p>
					{/if}
					<div class="sdocs-panels">
						<div class="sdocs-preview-wrapper">
							<PreviewFrame src={example.previewUrl ?? ''} {activeStylesheet} />
						</div>
						<CollapsiblePanel title="Code" defaultExpanded={false} flush>
							<div class="sdocs-code-block">{@html example.highlightedHtml ?? ''}</div>
						</CollapsiblePanel>
					</div>
				</div>
			{/each}
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
	.sdocs-forwarded {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
		font-size: 12px;
	}
	.sdocs-forwarded-label {
		color: var(--color-base-500);
	}
	.sdocs-forwarded-chip {
		padding: 2px 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 999px;
		background: var(--color-base-50);
		font-family: var(--mono);
		font-size: 11px;
		color: var(--color-base-600);
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
	.sdocs-block-description {
		margin: -2px 0 10px;
		font-size: 13px;
		color: var(--color-base-500);
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
		border-radius: 0;
		overflow-x: auto;
	}
	.sdocs-code-block :global(code) {
		font-family: var(--mono);
	}
</style>
