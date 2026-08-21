<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type {
		ComponentStatus,
		DocEntry,
		DocNote,
		ExtractedSnippet,
		FlowItem,
	} from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import { Note } from '../../ui/Note/index.js';
	import { nextTabIndex } from './tablist.js';
	import { Glossary } from '../../ui/Glossary/index.js';
	import NoteControl from './NoteControl.svelte';
	import TodoList from './TodoList.svelte';
	import NativeBody from './NativeBody.svelte';
	import { copyCode } from '../copy-code.svelte.js';
	import HeightHandle from './HeightHandle.svelte';
	import { highlightSvelte } from '../highlighter.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import TwoPaneSplit from '../../ui/TwoPaneSplit/TwoPaneSplit.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import diagonalsUrl from './diagonals.png';
	import ApiTable, { type Row } from './ApiTable.svelte';
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
	import { isNarrow } from '../viewport.svelte.js';

	interface Props {
		doc: DocEntry;
		/** If set, show only this example (full-page view) */
		snippetName?: string;
		/** Dev only: the note editor writes to the project's source. */
		dev?: boolean;
		activeStylesheet?: string;
		/** [PROSE] bodies from `virtual:sdocs`, keyed like doc/page content. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		/** Already-resolved prose components, from the prerenderer or the
		 * built app's entry, so hydration matches the static HTML. */
		preloaded?: Record<string, Component>;
	}

	let {
		doc,
		snippetName,
		activeStylesheet,
		dev = false,
		pageModules = {},
		preloaded = {},
	}: Props = $props();

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

	/**
	 * The tablist keyboard pattern.
	 *
	 * `role="tablist"` is a promise: a screen reader announces "tab 2 of 7" and
	 * the reader reaches for the arrow keys. It went unimplemented, so the
	 * announcement was a lie — worse than plain buttons, which at least behave
	 * the way they are described.
	 *
	 * Selection follows focus, which is the right choice here: switching a tab
	 * is instant and has no side effect worth confirming.
	 */
	const PANEL_ID = 'sdocs-preview-panel';
	const tabId = (slug: string) => `sdocs-tab-${slug}`;
	const activeTabId = $derived(
		activePreview ? tabId(activePreview.snippet.slug) : undefined,
	);

	function onTabKeydown(event: KeyboardEvent) {
		const to = nextTabIndex(event.key, activeIndex, previews.length);
		if (to === null) return;
		event.preventDefault();
		selectTab(to);
		// Focus follows selection, or the roving tabindex leaves focus on a tab
		// that is no longer the selected one.
		const strip = (event.currentTarget as HTMLElement).parentElement;
		(strip?.querySelectorAll('.sdocs-preview-tab')[to] as HTMLElement | undefined)?.focus();
	}

	const cd = $derived(activePreview?.componentData ?? null);

	const componentName = $derived(
		activePreview?.componentName ??
			((meta.title ?? '').split('/').pop()?.trim() || 'Component'),
	);
	/** The glyph and the words behind each status.
	 *
	 * One shape throughout, filling as the component matures: a hollow circle
	 * for a draft, half-filled while it is built, a dot under review, a query
	 * while it is experimental, a tick when it is ready, a cross once it is on
	 * the way out. A strip of tabs then reads as a scale rather than as six
	 * unrelated pictures, and every one is a square viewBox so they hold the
	 * same optical size beside each other.
	 *
	 * `draft` takes Font Awesome's *regular* circle, not its solid one: the
	 * solid `circle` is a filled disc, which would make the emptiest state read
	 * as the fullest and run the scale backwards. */
	/**
	 * The glyph and the words behind each status.
	 *
	 * Distinct **silhouettes**, not one shape with different insides. At 13px
	 * the interior of a glyph is four or five pixels: a circle holding a `?`,
	 * a circle holding a dot and a half-filled circle all read as "a coloured
	 * dot", and only a tick and a cross survive because those shapes are
	 * over-learned. An outline that differs at a glance is the whole job.
	 *
	 * `review` is an eye rather than a magnifier for a second reason: a
	 * magnifying glass means *search* everywhere in software, and this app has
	 * a search box in its own sidebar. An icon that already means something
	 * else in the same window means that other thing.
	 */
	const STATUS: Record<ComponentStatus, { icon: string; label: string }> = {
		draft: { icon: 'fa-pencil', label: 'Draft — sketched, not real yet' },
		wip: { icon: 'fa-screwdriver-wrench', label: 'Work in progress — being built' },
		review: { icon: 'fa-eye', label: 'In review — built, awaiting sign-off' },
		experimental: { icon: 'fa-flask', label: 'Experimental — usable, but the API may change' },
		ready: { icon: 'fa-circle-check', label: 'Ready — done, use it' },
		deprecated: { icon: 'fa-ban', label: 'Deprecated — on the way out' },
	};

	const exampleSnippets = $derived(doc.examples ?? []);

	/**
	 * What to render, in the order it was written.
	 *
	 * An entity parsed before the flow existed — or one built by a host that
	 * does not send it — falls back to the arrangement that was fixed before:
	 * prose, then the component, then the examples.
	 */
	const flow = $derived<FlowItem[]>(
		doc.flow ?? [
			...(doc.prose ?? []).map((_, index) => ({ kind: 'prose' as const, index })),
			...(previews.length ? [{ kind: 'components' as const, indices: previews.map((_, i) => i) }] : []),
			...exampleSnippets.map((_, index) => ({ kind: 'example' as const, index })),
		],
	);
	/** Where the run of examples starts — the heading opens it once. */
	const firstExampleAt = $derived(flow.findIndex((item) => item.kind === 'example'));
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
		let cancelled = false;
		clearTimeout(highlightTimer);
		highlightTimer = setTimeout(async () => {
			try {
				const html = await highlightSvelte(code);
				if (!cancelled) highlightedUsageHtml = html;
			} catch {
				if (!cancelled) highlightedUsageHtml = '';
			}
		}, 150);
		// Both halves matter. The timer outlives the view otherwise — a route
		// change inside the debounce window leaves it to fire against a
		// destroyed component — and Shiki's `await` can still resolve after
		// that, so the run is flagged as well as cancelled. The flag is also
		// what drops a stale highlight: comparing the finished `code` against
		// `usageCode` did that before, but that read of a `$derived` owned by
		// this (by then destroyed) effect is exactly what Svelte warns about
		// as `derived_inert`.
		return () => {
			cancelled = true;
			clearTimeout(highlightTimer);
		};
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

	// Resizable stage widths, local to this page. Each starts at the content
	// column width (capped to the room, minus the handle bar) and resets when
	// the entity changes; dragging writes the pixel size back. Only [LAYOUT]
	// pages remember their width across pages and reloads.
	/**
	 * The width a stage sits at before anyone drags it.
	 *
	 * Plain `$state`, refreshed by the reset effect below — deliberately not a
	 * `$derived`, and deliberately not computed from `doc` at read time.
	 *
	 * `TwoPaneSplit` takes its width through a function binding
	 * (`bind:leftWidth={get, set}`), so Svelte calls the getter reactively and
	 * everything the getter touches becomes a dependency of the split. One
	 * local signal keeps that graph the size of the thing being read; reaching
	 * through `doc` would hang the whole entity off a width.
	 */
	let stageDefaultWidth = $state('calc(100% - 10px)');

	function defaultStageWidth(): string {
		return stageDefaultWidth;
	}
	let previewWidth = $state<number | string>('100%');
	let focusedWidth = $state<number | string>('100%');
	// Per-example drag overrides; an example without one sits at the default.
	let exampleOverrides = $state<Record<string, number | string>>({});
	/** Stage heights the reader dragged to, by stage key; absent means the
	 * stage still sizes itself to its content. */
	let stageHeights = $state<Record<string, number>>({});
	$effect(() => {
		// Track the entity, not just its width. This read is the whole point:
		// without it the effect's only dependency is `doc.maxWidth`, so moving
		// between two components that share a width — which is every component
		// on a default config — never reset anything, and a stage dragged
		// narrow on one page stayed narrow on the next.
		void doc.entitySlug;
		stageDefaultWidth = doc.maxWidth
			? `min(calc(100% - 10px), ${doc.maxWidth})`
			: 'calc(100% - 10px)';
		previewWidth = stageDefaultWidth;
		focusedWidth = stageDefaultWidth;
		exampleOverrides = {};
		stageHeights = {};
	});

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

	// A phone has no room to drag a stage narrower and no pointer to grab the
	// handle with, so the split collapses to the pane alone.
	const narrow = $derived(isNarrow());
</script>

<!-- The stage: a preview pane that can be dragged narrower, with the hatched
     canvas as the room to drag into. `get`/`set` are the width binding —
     each caller owns where that width is stored. -->
<!-- Tags and synonyms: metadata, deliberately quiet. They sit between the
     block's prose and its stage, and read as a footnote to the description
     rather than a heading of their own. -->
<!-- Every note an opener carries, in the order it was written. -->
{#snippet notes(list: DocNote[], onclose?: (i: number) => void)}
	{#each list as entry, i (i)}
		<Note text={entry.note} type={entry.type} onclose={onclose && (() => onclose(i))} />
	{/each}
{/snippet}

<!-- Everything an [EXAMPLE] carries above its stage, in the language's order:
     description, notes, todo, prose, tags. Shared by the example in a
     component's list and the same example opened on its own route — a stage on
     its own page is still the same block, and used to arrive stripped of
     everything but its title. -->
{#snippet exampleHeader(example: ExtractedSnippet)}
	{#if example.description}
		<p class="sdocs-block-description">{@html renderInlineMarkdown(example.description)}</p>
	{/if}
	{#if example.notes?.length}
		{@render notes(example.notes)}
	{/if}
	{#if example.todos?.length}
		<TodoList
			items={example.todos}
			{dev}
			file={doc.filePath}
			entitySlug={doc.entitySlug}
			exampleTitle={example.name}
		/>
	{/if}
	{#if example.proseHtml}
		<div class="sdocs-prose sdocs-prose-block" {@attach copyCode()}>{@html example.proseHtml}</div>
	{/if}
	{#if example.tags?.length}
		{@render metaChips(example.tags, 'Tags', 'sm')}
	{/if}
{/snippet}

{#snippet metaChips(items: string[], label: string, size: 'sm' | 'md')}
	<ul class="sdocs-meta-chips" aria-label={label}>
		{#each items as item (item)}
			<li class="sdocs-meta-chip" class:is-md={size === 'md'}>{item}</li>
		{/each}
	</ul>
{/snippet}

{#snippet stage(
	content: Snippet,
	get: () => number | string,
	set: (v: number | string) => void,
	reset: () => void,
	key: string,
)}
	{#snippet heightHandle()}
		<!-- Rendered inside the pane rather than beside the split: the pane is
		     already the width the horizontal handle set, so the bar tracks it
		     for free — and it sits flush under the frame instead of below the
		     stage's bottom margin. A [LAYOUT] has none of this; it is the
		     viewport's height by definition. -->
		<HeightHandle
			height={stageHeights[key] ?? null}
			onchange={(h) => (stageHeights[key] = h)}
			onreset={() => {
				const next = { ...stageHeights };
				delete next[key];
				stageHeights = next;
			}}
		/>
	{/snippet}
	<div class="sdocs-preview-split">
		{#if narrow}
			<div class="sdocs-preview-pane">{@render content()}{@render heightHandle()}</div>
		{:else}
			{@const w = get()}
			<TwoPaneSplit bind:leftWidth={get, set} leftMinWidth={1} handleBarWidth={10} height="auto">
				{#snippet left()}
					<!-- Inside the pane, right after the frame: the pane is
					     `height: 100%`, so a handle beside it lets the pane
					     stretch past the frame and the bar stops hugging it. -->
					<div class="sdocs-preview-pane">{@render content()}{@render heightHandle()}</div>
				{/snippet}
				{#snippet right()}
					<div class="sdocs-resize-canvas" style:background-image={`url(${diagonalsUrl})`}></div>
				{/snippet}
			</TwoPaneSplit>
			{#if typeof w === 'number'}
				<button
					class="sdocs-resize-readout"
					style:left={`min(${w + 18}px, calc(100% - 64px))`}
					title="Reset width"
					onclick={reset}
				>
					{w}px
				</button>
			{/if}
		{/if}
	</div>
{/snippet}

<div class="sdocs-component-view" style:--sdocs-content-max={doc.maxWidth}>
	{#if focusedSnippet}
		<!-- Example full-page view -->
		<div class="sdocs-view-header">
			<div class="sdocs-title-row">
				<h1 class="sdocs-view-title">{displayTitle(meta.title)} / {snippetName}</h1>
				<NoteControl
					{dev}
					label="{displayTitle(meta.title)} / {snippetName}"
					file={doc.filePath}
					entitySlug={doc.entitySlug}
					exampleTitle={snippetName}
					notes={focusedSnippet.notes ?? []}
					todos={focusedSnippet.todos ?? []}
				/>
			</div>
			<!-- Opened on its own, an example is the whole page: everything it
			     carries travels with it, or a warning only shows on the way in. -->
			{@render exampleHeader(focusedSnippet)}
		</div>
		<!-- The example IS the page — its stage rides the same resizable split. -->
		{#snippet focusedContent()}
			<div class="sdocs-preview-wrapper">
				<PreviewFrame
					src={focusedSnippet.previewUrl ?? ''}
					{activeStylesheet}
					stage={focusedSnippet}
					height={stageHeights['focused'] ?? null}
				/>
			</div>
		{/snippet}
		{@render stage(
			focusedContent,
			() => focusedWidth,
			(v) => (focusedWidth = v),
			() => (focusedWidth = defaultStageWidth()),
			'focused',
		)}
		{#if focusedSnippet.showCode !== false}
			<div class="sdocs-panels">
				<CollapsiblePanel title="Code" defaultExpanded={false} flush>
					<div class="sdocs-code-block" {@attach copyCode()}>
						{@html focusedSnippet.highlightedHtml ?? ''}
					</div>
				</CollapsiblePanel>
			</div>
		{/if}
	{:else}
		<!-- Full component view -->
		<div class="sdocs-view-header">
			<div class="sdocs-title-row">
				<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
				<NoteControl
					{dev}
					label={displayTitle(meta.title)}
					file={doc.filePath}
					entitySlug={doc.entitySlug}
					notes={meta.notes ?? []}
					todos={meta.todos ?? []}
				/>
			</div>
			{#if meta.description}
				<p class="sdocs-view-description">{@html renderInlineMarkdown(meta.description)}</p>
			{/if}
			{#if meta.notes?.length}
				{@render notes(meta.notes)}
			{/if}
			{#if meta.todos?.length}
				<TodoList
					items={meta.todos}
					{dev}
					file={doc.filePath}
					entitySlug={doc.entitySlug}
				/>
			{/if}
		</div>

		<!-- The body, in the order it was written. [COMPONENT] blocks are the one
		     exception to source order: they are tabs over a shared stage, so they
		     render as a single item wherever the first of them appears. -->
		{#snippet componentsBlock()}
			<!-- Shown for a single component too: the tab names the component
			     being previewed, and carries its status — a page that drops the
			     strip when there is one component makes that information appear
			     and disappear with the count. -->
			{#if previews.length > 0}
				<div
					class="sdocs-preview-tabs"
					role="tablist"
					aria-label="Components"
				>
					{#each previews as preview, i (preview.snippet.slug)}
						<button
							class="sdocs-preview-tab"
							class:active={i === activeIndex}
							class:is-only={previews.length === 1}
							id={tabId(preview.snippet.slug)}
							role="tab"
							aria-selected={i === activeIndex}
							aria-controls={PANEL_ID}
							{...{ tabindex: i === activeIndex ? 0 : -1 }}
							disabled={previews.length === 1}
							onclick={() => selectTab(i)}
							onkeydown={onTabKeydown}
						>
							{preview.label}
							{#if preview.snippet.status}
								{@const status = STATUS[preview.snippet.status]}
								<span
									class="sdocs-status"
									data-status={preview.snippet.status}
									title={status.label}
									aria-label={status.label}
								>
									<Icon name={status.icon} --w="13px" --h="13px" --fill="currentColor" />
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Everything below belongs to the selected tab — description, stage,
			     code panels, API tables — so it is the one region the tab
			     controls. A tablist that points at nothing tells a screen reader
			     a tab was selected and leaves it with nowhere to go. -->
			<div id={PANEL_ID} role="tabpanel" aria-labelledby={activeTabId} tabindex="-1">
			<!-- Both descriptions, most specific first: what this preview says
			     about itself, then what the component says about itself wherever
			     it appears. Prose between the tabs and the stage, never part of
			     the preview panel. -->
			{#if activePreview?.snippet.description}
				<p class="sdocs-preview-description">
					{@html renderInlineMarkdown(activePreview.snippet.description)}
				</p>
			{/if}
			{#if cd?.descriptionHtml}
				<div class="sdocs-prose sdocs-component-description" {@attach copyCode()}>
					{@html cd.descriptionHtml}
				</div>
			{/if}

			{#if activePreview?.snippet.synonyms?.length}
				{@render metaChips(activePreview.snippet.synonyms, 'Also known as', 'md')}
			{/if}

			{#if activePreview}
				<!-- The stage rides in a resizable pane spanning the full view width:
				     drag the handle to narrow the iframe and test responsive layouts. -->
				{#snippet previewContent()}
					{#key activePreview.snippet.slug}
						<div class="sdocs-preview-wrapper">
							<PreviewFrame
								bind:this={defaultPreview}
								src={activePreview.snippet.previewUrl ?? ''}
								stage={activePreview.snippet}
								props={propValues}
								cssVars={appliedCss}
								{activeStylesheet}
								height={stageHeights[activePreview.snippet.slug] ?? null}
								onStateValues={(values) => (liveStateValues = values)}
								onready={resolveVarColors}
							/>
						</div>
					{/key}
				{/snippet}
				{@render stage(
					previewContent,
					() => previewWidth,
					(v) => (previewWidth = v),
					() => (previewWidth = defaultStageWidth()),
					activePreview.snippet.slug,
				)}

				<div class="sdocs-panels">
					<CollapsiblePanel title="Preview Code" defaultExpanded={false} flush>
						<div class="sdocs-code-block" {@attach copyCode()}>
							{#if highlightedUsageHtml}
								{@html highlightedUsageHtml}
							{:else}
								<pre><code>{usageCode}</code></pre>
							{/if}
						</div>
					</CollapsiblePanel>

					{#if activePreview.highlightedSource}
						<CollapsiblePanel title="Component Source" defaultExpanded={false} flush>
							<div class="sdocs-code-block" {@attach copyCode()}>
								{@html activePreview.highlightedSource}
							</div>
						</CollapsiblePanel>
					{/if}
				</div>
			{/if}

			{#snippet propControl(row: Row)}
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

			{#snippet methodControl(row: Row)}
				{@const method = cd?.methods.find((m) => m.name === row.name)}
				{@const hasParams = String(method?.params ?? '').trim().length > 0}
				<button
					class="sdocs-run-btn"
					disabled={hasParams || !defaultPreview}
					title={hasParams ? 'Only methods without parameters can be run here' : `Run ${row.name}() on the preview`}
					onclick={() => defaultPreview?.callMethod(String(row.name))}
				>
					Run
				</button>
			{/snippet}

			{#snippet cssPropControl(row: Row)}
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
			</div>
		{/snippet}

		{#snippet exampleBlock(example: ExtractedSnippet)}
			<!-- The slug is frozen here rather than read inside the closures
			     below: they are called from TwoPaneSplit's own effect, and a
			     captured string keeps `exampleSnippets` out of that effect's
			     dependencies. -->
			{@const slug = example.slug}
			<div class="sdocs-example">
				<h3 class="sdocs-example-title">
					<Icon name="bookmark" --w="14px" --h="14px" --fill="var(--color-example-500)" />
					{example.name || '⚠ title required'}
					<NoteControl
						{dev}
						label="{displayTitle(meta.title)} / {example.name}"
						file={doc.filePath}
						entitySlug={doc.entitySlug}
						exampleTitle={example.name}
						notes={example.notes ?? []}
						todos={example.todos ?? []}
					/>
				</h3>
				{@render exampleHeader(example)}
				{#snippet exampleContent()}
					<div class="sdocs-preview-wrapper">
						<PreviewFrame
							src={example.previewUrl ?? ''}
							{activeStylesheet}
							stage={example}
							height={stageHeights[slug] ?? null}
						/>
					</div>
				{/snippet}
				{@render stage(
					exampleContent,
					() => exampleOverrides[slug] ?? defaultStageWidth(),
					(v) => (exampleOverrides[slug] = v),
					() => {
						const next = { ...exampleOverrides };
						delete next[slug];
						exampleOverrides = next;
					},
					slug,
				)}
				{#if example.showCode !== false}
					<div class="sdocs-panels">
						<CollapsiblePanel title="Code" defaultExpanded={false} flush>
							<div class="sdocs-code-block" {@attach copyCode()}>
								{@html example.highlightedHtml ?? ''}
							</div>
						</CollapsiblePanel>
					</div>
				{/if}
			</div>
		{/snippet}

		{#each flow as item, i (i)}
			{#if item.kind === 'prose'}
				{@const block = doc.prose?.[item.index]}
				{#if block}
					<div class="sdocs-prose sdocs-prose-block" {@attach copyCode()}>
						<NativeBody key={block.key} {pageModules} {preloaded} />
					</div>
				{/if}
			{:else if item.kind === 'glossary'}
				{@const glossary = doc.glossaries?.[item.index]}
				{#if glossary}
					<div class="sdocs-glossary-block">
						<Glossary
							terms={glossary.terms}
							title={glossary.title}
							subtitle={glossary.subtitle}
							search={glossary.search}
						/>
					</div>
				{/if}
			{:else if item.kind === 'components'}
				{@render componentsBlock()}
			{:else}
				{@const example = exampleSnippets[item.index]}
				{#if example}
					<!-- The heading opens the run of examples once, wherever it
					     starts — prose written between two of them does not repeat it. -->
					{#if i === firstExampleAt}
						<hr class="sdocs-divider" />
						<h2 class="sdocs-section-title">Examples</h2>
					{/if}
					{@render exampleBlock(example)}
				{/if}
			{/if}
		{/each}

	{/if}
</div>

<style>
	.sdocs-component-view {
		padding: 24px 32px;
		/* Everything sits in a content column capped at the doc's maxWidth
		   (config/entity cascade) — except the resizable preview split, which
		   spans the full view so the stage can grow past the column. */
		display: grid;
		grid-template-columns: minmax(0, var(--sdocs-content-max, 1200px)) 1fr;
		font-family: var(--sans);
	}
	.sdocs-component-view > * {
		grid-column: 1;
	}
	.sdocs-component-view > .sdocs-preview-split {
		grid-column: 1 / -1;
	}
	.sdocs-component-view > .sdocs-example {
		grid-column: 1 / -1;
	}
	.sdocs-example > .sdocs-example-title,
	.sdocs-example > .sdocs-block-description,
	.sdocs-example > .sdocs-meta-chips,
	.sdocs-example > .sdocs-panels {
		max-width: var(--sdocs-content-max, 1200px);
	}

	/* The resizable stage: the pane carries the panel chrome; the canvas on the
	   right is the empty room to drag into. */
	.sdocs-preview-split {
		position: relative;
		margin-bottom: 32px;
		/* Clip the x-overhang (the handle's outer lip, a readout that ran off
		   the page) without creating a scroll container. */
		overflow-x: clip;
		/* The handle bar is invisible until hovered — the grey only appears
		   when the pointer reaches it (or while dragging) — and the grip line
		   sits light until then. */
		--handleBg: transparent;
		--handleColor: var(--color-base-300);
		--hoverHandleColor: var(--color-base-0);
	}
	/* The split is never shorter than the width readout (21px) plus a hair of
	   air, so the chip fits centred even beside a tiny preview. */
	.sdocs-preview-split :global(.TwoPaneSplit) {
		min-height: 25px;
	}
	/* Bare viewport: no border, no radius — the canvas stripes and the handle
	   bar delineate the stage, and the iframe width is exactly the pane's. */
	.sdocs-preview-pane {
		height: 100%;
		box-sizing: border-box;
		background: var(--color-base-0);
	}
	.sdocs-resize-canvas {
		height: 100%;
		box-sizing: border-box;
		border-radius: 8px;
		/* The diagonal-hatch tile (an image beats hairline gradients, which
		   shimmer at fractional device-pixel ratios). The 26px tile is a 2x
		   export — displayed at 13px it maps 1:1 to retina device pixels. */
		background-repeat: repeat;
		background-size: 13px 13px;
	}
	/* Rides beside the handle, vertically centred, clamped inside the view so
	   it stays reachable when the window shrinks below the stored width.
	   Clicking it resets the stage to its default width. */
	.sdocs-resize-readout {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		z-index: 3;
		display: inline-block;
		padding: 2px 7px;
		border: 1px solid var(--color-base-150);
		border-radius: 4px;
		background: var(--color-base-0);
		font-family: var(--mono, monospace);
		font-size: 11px;
		color: var(--color-base-500);
		white-space: nowrap;
		cursor: pointer;
	}
	.sdocs-resize-readout:hover {
		background: var(--color-base-50);
		color: var(--color-base-700);
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
		/* Enough tabs — or long enough labels — and the strip ran out of the
		   layout instead of staying inside it. It scrolls like the top bar's
		   section tabs; unlike those, there is no compact mode to fall back
		   to, so scrolling is the whole fix. */
		overflow-x: auto;
		/* Without this a flex item refuses to shrink below its content. */
		min-width: 0;
	}
	.sdocs-preview-tab {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	/* A lone tab is a label, not a choice: it keeps the active underline and
	   the component's name, but nothing about it invites a click. */
	.sdocs-preview-tab.is-only {
		cursor: default;
		opacity: 1;
	}

	/* Colour tells the lifecycle apart at a glance: nothing yet is grey, in the
	   workshop is amber, being looked at is blue, unproven is purple, go is
	   green — and retired is grey again.

	   Deprecated is deliberately **not** red. The component still works; it is
	   on the way out, not broken. Red would say "error", would compete with the
	   `bug` note that means something is actually wrong, and would shout at a
	   reader for using something that works today. Grey at both ends of the
	   scale reads as "not for you right now", which is what both mean. */
	.sdocs-status {
		display: inline-flex;
		align-items: center;
		color: var(--color-base-400);
	}
	.sdocs-status[data-status='wip'] {
		color: var(--color-amber-500);
	}
	.sdocs-status[data-status='review'] {
		color: var(--color-action-500);
	}
	.sdocs-status[data-status='experimental'] {
		color: var(--color-purple-500);
	}
	.sdocs-status[data-status='ready'] {
		color: var(--color-success-500);
	}
	.sdocs-status[data-status='deprecated'] {
		color: var(--color-base-500);
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
	.sdocs-view-header :global(.Note) {
		margin: 10px 0;
	}
	/* The header stacks on margins rather than a gap, so the todo has to bring
	   its own — it was landing flush against the description. Top only: the
	   header's own margin-bottom already spaces whatever follows it. */
	.sdocs-view-header :global(.sdocs-todo) {
		margin-top: 12px;
	}
	/* An example's column already spaces its rows; these only need holding to
	   the content width like their siblings. Without the cap the todo stretched
	   across both grid tracks — past the notes above it and into the room the
	   stage keeps for dragging. */
	.sdocs-example > :global(.Note),
	.sdocs-example > :global(.sdocs-todo),
	.sdocs-example > :global(.sdocs-prose-block) {
		max-width: var(--sdocs-content-max, 1200px);
	}
	/* The title and whatever rides at the end of its line. */
	.sdocs-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	/* A [PROSE] block sits in the page flow like a paragraph of the entity's
	   own, so its first and last elements do not add margin to the gap the
	   view already sets between blocks. */
	/* Its own elements' margins are trimmed at both ends so the block occupies
	   exactly its text, and the block then sets the gap to what follows it —
	   the tab strip was sitting flush against the last paragraph. */
	.sdocs-prose-block {
		margin-bottom: 22px;
	}
	/* Held to the content column and spaced like the prose it sits among. */
	.sdocs-glossary-block {
		max-width: var(--sdocs-content-max, 1200px);
		margin-bottom: 22px;
	}
	.sdocs-prose-block > :global(:first-child) {
		margin-top: 0;
	}
	.sdocs-prose-block > :global(:last-child) {
		margin-bottom: 0;
	}

	.sdocs-view-description {
		font-size: 14px;
		line-height: 1.5;
		/* 4.35:1 on base-500 — just under the 4.5:1 floor. */
		color: var(--color-base-600);
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
		/* Same treatment as a sidebar group label. Measured at 2.72:1 against the
		   page on base-400 — an 11px label needs 4.5:1, so it sits two steps
		   darker. */
		font-size: 11px;
		font-weight: 600;
		color: var(--color-base-600);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin: 32px 0 16px;
	}
	.sdocs-example + .sdocs-example {
		margin-top: 40px;
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
	/* Under the block's own description, above the stage. Its top margin is
	   trimmed so the two read as one passage rather than two boxes. */
	.sdocs-component-description {
		max-width: var(--sdocs-content-max, 1200px);
		margin-bottom: 14px;
	}
	.sdocs-component-description > :global(:first-child) {
		margin-top: 0;
	}
	.sdocs-component-description > :global(:last-child) {
		margin-bottom: 0;
	}

	.sdocs-preview-description {
		margin: 2px 0 12px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--color-base-500);
	}
	.sdocs-meta-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		/* Clear of the title or description above and the stage below. */
		margin: 2px 0 12px;
		padding: 0;
		list-style: none;
	}
	/* Badges, not pills: the corner is rounded, not run all the way round, and
	   the fill alone carries them — a stroke would ask for more attention than
	   a footnote deserves. */
	.sdocs-meta-chip {
		padding: 0 5px;
		border-radius: 3px;
		background: var(--color-base-100);
		font-size: 10px;
		line-height: 1.8;
		color: var(--color-base-600);
	}
	/* A component's other names carry more weight than one example's tags. */
	.sdocs-meta-chip.is-md {
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 12px;
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
		/* The copy button is positioned against this. */
		position: relative;
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

	@media (max-width: 860px) {
		.sdocs-component-view {
			/* The second track existed to give the stage room to be dragged
			   into; without a handle it is just wasted width. */
			display: block;
			padding: 16px;
		}
		.sdocs-view-title {
			font-size: 20px;
		}
		.sdocs-view-header {
			margin-bottom: 16px;
		}
		/* Enough previews and the tabs stop fitting — let them scroll rather
		   than wrap into a stack that pushes the stage off the screen. */
		.sdocs-preview-tabs {
			overflow-x: auto;
			scrollbar-width: none;
		}
		.sdocs-preview-tab {
			flex-shrink: 0;
			padding: 10px 12px;
		}
		.sdocs-reset-btn,
		.sdocs-run-btn {
			min-height: 36px;
		}
	}
</style>
