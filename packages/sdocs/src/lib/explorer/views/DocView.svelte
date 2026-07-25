<script lang="ts">
	import { renderInlineMarkdown } from './format.js';
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import { displayTitle } from '../tree-builder.js';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
		/** Native page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		/** Already-resolved content components: the prerenderer passes all of
		 * them (effects never run server-side) and the built app's entry passes
		 * the current route's, so hydration matches the static HTML. */
		preloaded?: Record<string, Component>;
	}

	let { doc, activeStylesheet, pageModules = {}, preloaded = {} }: Props = $props();

	const meta = $derived(doc.meta);
	const toc = $derived(doc.toc ?? []);

	// The page body compiles to its own component (prose + islands + example
	// markers); it renders here, natively — sdocs styling, no iframe. Only the
	// [example] stages load the project's css, each in its own PreviewFrame.
	let loaded = $state<Component | null>(null);
	const PageComponent = $derived(
		(doc.contentKey ? preloaded[doc.contentKey] : undefined) ?? loaded,
	);
	let container: HTMLElement | undefined = $state();

	$effect(() => {
		if (doc.contentKey && preloaded[doc.contentKey]) return;
		const load = doc.contentKey ? pageModules[doc.contentKey] : undefined;
		loaded = null;
		if (!load) return;
		let stale = false;
		load().then((mod) => {
			if (!stale) loaded = mod.default as Component;
		});
		return () => {
			stale = true;
		};
	});

	// Scrollspy: the TOC highlights the section currently in view. The active
	// heading is the last one above the threshold line near the viewport top.
	// The scroll listener is capturing because the scrolling element is an
	// ancestor container, not the window.
	const SPY_OFFSET = 120;
	let activeId = $state('');
	let spyLockUntil = 0;

	$effect(() => {
		if (!container || toc.length === 0) return;
		void PageComponent; // re-run once the page body has mounted
		const ids = toc.map((h) => h.id);
		let frame = 0;
		const update = () => {
			frame = 0;
			if (performance.now() < spyLockUntil) return;
			// At the bottom the last sections can never reach the threshold
			// line — snap to the final entry so it is reachable at all.
			let scroller: HTMLElement | null = container ?? null;
			while (scroller) {
				const o = getComputedStyle(scroller).overflowY;
				if (
					scroller.scrollHeight > scroller.clientHeight + 1 &&
					(o === 'auto' || o === 'scroll')
				) {
					break;
				}
				scroller = scroller.parentElement;
			}
			// A page too short to scroll is "at the top", not "at the bottom" —
			// the walk above only yields a scroller that actually overflows.
			const atBottom = scroller
				? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
				: document.documentElement.scrollHeight >
						document.documentElement.clientHeight + 1 &&
					window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
			if (atBottom) {
				activeId = ids[ids.length - 1];
				return;
			}
			let current = ids[0] ?? '';
			for (const id of ids) {
				const el = container?.querySelector(`#${CSS.escape(id)}`);
				if (!el) continue;
				if (el.getBoundingClientRect().top > SPY_OFFSET) break;
				current = id;
			}
			activeId = current;
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		document.addEventListener('scroll', onScroll, { capture: true, passive: true });
		window.addEventListener('resize', onScroll);
		return () => {
			document.removeEventListener('scroll', onScroll, { capture: true });
			window.removeEventListener('resize', onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	function scrollToHeading(id: string) {
		// Highlight the target right away and hold it while the smooth scroll
		// passes intermediate sections.
		activeId = id;
		spyLockUntil = performance.now() + 800;
		container?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth' });
	}

	// contentX aligns the whole column (content + toc) inside the view.
	const columnMargin = $derived(
		doc.contentX === 'center' ? '0 auto' : doc.contentX === 'right' ? '0 0 0 auto' : undefined,
	);
</script>

{#snippet exampleFrame(index: number)}
	{@const example = doc.examples?.[index]}
	{#if example}
		<div class="sdocs-page-example">
			{#if example.name}
				<h3 class="sdocs-example-title">
					<Icon name="bookmark" --w="14px" --h="14px" --fill="var(--color-example-500)" />
					{example.name || '⚠ title required'}
				</h3>
				{#if example.description}
					<p class="sdocs-block-description">{@html renderInlineMarkdown(example.description)}</p>
				{/if}
			{/if}
			<div class="sdocs-panels">
				<div class="sdocs-preview-wrapper">
					<PreviewFrame src={example.previewUrl ?? ''} {activeStylesheet} stage={example} />
				</div>
				<CollapsiblePanel title="Code" defaultExpanded={false} flush>
					<div class="sdocs-code-block">{@html example.highlightedHtml ?? ''}</div>
				</CollapsiblePanel>
			</div>
		</div>
	{/if}
{/snippet}

<div class="sdocs-page-view" style:padding={doc.padding}>
	<!-- maxWidth constrains the whole column — content plus toc; contentX
	     places it. Without a toc the content takes the toc's space. -->
	<div class="sdocs-page-inner" style:max-width={doc.maxWidth} style:margin={columnMargin}>
		<div class="sdocs-page-main">
			<!-- Header: a body `#` heading takes over as the page title -->
			{#if !doc.bodyTitle}
				<div class="sdocs-view-header">
					<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
					{#if meta.description}
						<p class="sdocs-view-description">{@html renderInlineMarkdown(meta.description)}</p>
					{/if}
				</div>
			{/if}

			<!-- Content -->
			<div class="sdocs-page-content" bind:this={container}>
				{#if PageComponent}
					<PageComponent __sdocsExample={exampleFrame} />
				{/if}
			</div>
		</div>

		<!-- Table of Contents -->
		{#if toc.length > 0 && doc.showToc !== false}
			<aside class="sdocs-toc">
				<h3 class="sdocs-toc-title">On this page</h3>
				<nav>
					<ul class="sdocs-toc-list">
						{#each toc as heading (heading.id)}
							<li class="sdocs-toc-item" style:padding-left="{(heading.level - 2) * 12}px">
								<button
									class="sdocs-toc-link"
									class:is-active={heading.id === activeId}
									aria-current={heading.id === activeId ? 'true' : undefined}
									onclick={() => scrollToHeading(heading.id)}
								>
									{heading.text}
								</button>
							</li>
						{/each}
					</ul>
				</nav>
			</aside>
		{/if}
	</div>
</div>

<style>
	.sdocs-page-view {
		/* padding comes from the doc entry (config/entity cascade) */
		font-family: var(--sans);
	}
	.sdocs-page-inner {
		display: flex;
		gap: 24px;
		/* max-width and margin (contentX) come from the doc entry */
	}
	.sdocs-page-main {
		flex: 1;
		min-width: 0;
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
		line-height: 1.5;
		color: var(--color-base-500);
		margin: 6px 0 0;
	}

	/* ── Page prose: the docs app's own typography ── */
	.sdocs-page-content {
		font-size: 14px;
		line-height: 1.7;
		color: var(--color-base-800);
	}
	.sdocs-page-content :global(h1),
	.sdocs-page-content :global(h2),
	.sdocs-page-content :global(h3),
	.sdocs-page-content :global(h4),
	.sdocs-page-content :global(h5),
	.sdocs-page-content :global(h6) {
		color: var(--color-base-900);
		font-weight: 650;
		line-height: 1.3;
		margin: 1.6em 0 0.5em;
		scroll-margin-top: 16px;
	}
	/* The body h1 serves as the page title — match .sdocs-view-title */
	.sdocs-page-content :global(h1) {
		font-size: 24px;
		font-weight: 700;
	}
	.sdocs-page-content :global(h2) { font-size: 18px; }
	.sdocs-page-content :global(h3) { font-size: 15px; }
	.sdocs-page-content :global(h4),
	.sdocs-page-content :global(h5),
	.sdocs-page-content :global(h6) { font-size: 14px; }
	.sdocs-page-content :global(h1:first-child),
	.sdocs-page-content :global(h2:first-child),
	.sdocs-page-content :global(h3:first-child) {
		margin-top: 0;
	}
	.sdocs-page-content :global(p) {
		margin: 0.7em 0;
	}
	.sdocs-page-content :global(a) {
		color: var(--color-action-500, var(--color-base-900));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.sdocs-page-content :global(ul),
	.sdocs-page-content :global(ol) {
		margin: 0.7em 0;
		padding-left: 1.6em;
	}
	.sdocs-page-content :global(li) {
		margin: 0.25em 0;
	}
	.sdocs-page-content :global(blockquote) {
		margin: 0.9em 0;
		padding: 2px 16px;
		border-left: 3px solid var(--color-base-200);
		color: var(--color-base-600);
	}
	.sdocs-page-content :global(hr) {
		border: none;
		border-top: 1px solid var(--color-base-200);
		margin: 24px 0;
	}
	.sdocs-page-content :global(code) {
		font-family: var(--mono);
		font-size: 0.92em;
	}
	.sdocs-page-content :global(:not(pre) > code) {
		background: var(--color-base-100);
		border-radius: 4px;
		padding: 1px 5px;
	}
	.sdocs-page-content :global(pre) {
		margin: 0.9em 0;
		padding: 12px;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
		tab-size: 4;
	}
	.sdocs-page-content :global(table) {
		border-collapse: collapse;
		margin: 0.9em 0;
		display: block;
		max-width: 100%;
		overflow-x: auto;
	}
	.sdocs-page-content :global(th),
	.sdocs-page-content :global(td) {
		border: 1px solid var(--color-base-200);
		padding: 6px 12px;
		text-align: left;
	}
	.sdocs-page-content :global(td[align='center']),
	.sdocs-page-content :global(th[align='center']) {
		text-align: center;
	}
	.sdocs-page-content :global(td[align='right']),
	.sdocs-page-content :global(th[align='right']) {
		text-align: right;
	}
	.sdocs-page-content :global(th) {
		background: var(--color-base-50);
		font-weight: 600;
	}
	.sdocs-page-content :global(img) {
		max-width: 100%;
		border-radius: 6px;
	}

	/* Task lists: GitHub-style checkboxes, no bullet */
	.sdocs-page-content :global(li:has(> input[type='checkbox']:first-child)) {
		list-style: none;
		margin-left: -1.3em;
	}
	.sdocs-page-content :global(li > input[type='checkbox']) {
		margin-right: 6px;
		vertical-align: -2px;
	}

	/* GitHub-style alerts: > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION] */
	.sdocs-page-content :global(.sdocs-alert) {
		margin: 0.9em 0;
		padding: 8px 16px;
		border-left: 3px solid var(--sdocs-alert-color);
		border-radius: 0 6px 6px 0;
		background: color-mix(in srgb, var(--sdocs-alert-color) 6%, transparent);
	}
	.sdocs-page-content :global(.sdocs-alert-label) {
		font-size: 13px;
		font-weight: 650;
		color: var(--sdocs-alert-color);
		margin: 0.25em 0 0;
	}
	.sdocs-page-content :global(.sdocs-alert-note) {
		--sdocs-alert-color: var(--color-blue-500);
	}
	.sdocs-page-content :global(.sdocs-alert-tip) {
		--sdocs-alert-color: var(--color-green-500);
	}
	.sdocs-page-content :global(.sdocs-alert-important) {
		--sdocs-alert-color: var(--color-purple-500);
	}
	.sdocs-page-content :global(.sdocs-alert-warning) {
		--sdocs-alert-color: var(--color-amber-500);
	}
	.sdocs-page-content :global(.sdocs-alert-caution) {
		--sdocs-alert-color: var(--color-red-500);
	}

	/* ── Example stages in the page flow ── */
	.sdocs-page-example {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 16px 0;
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
		/* stage padding lives inside the iframe (config/block cascade) */
		background: var(--color-base-0);
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

	/* ── Table of contents ── */
	.sdocs-toc {
		width: 200px;
		flex-shrink: 0;
		position: sticky;
		top: 24px;
		align-self: flex-start;
	}
	.sdocs-toc-title {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-base-400);
		margin: 0 0 8px;
	}
	.sdocs-toc-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.sdocs-toc-item {
		margin: 0;
	}
	.sdocs-toc-link {
		display: block;
		padding: 4px 0;
		font-size: 13px;
		color: var(--color-base-500);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s;
	}
	.sdocs-toc-link:hover,
	.sdocs-toc-link.is-active {
		color: var(--color-action-500);
	}
</style>
