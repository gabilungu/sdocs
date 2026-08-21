<script lang="ts">
	import { renderInlineMarkdown } from './format.js';
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import { Note } from '../../ui/Note/index.js';
	import { Glossary } from '../../ui/Glossary/index.js';
	import NoteControl from './NoteControl.svelte';
	import TodoList from './TodoList.svelte';
	import { copyCode } from '../copy-code.svelte.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import HeightHandle from './HeightHandle.svelte';
	import { displayTitle } from '../tree-builder.js';
	import { capSidePadding, isNarrow } from '../viewport.svelte.js';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
		/** Native page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		/** Already-resolved content components: the prerenderer passes all of
		 * them (effects never run server-side) and the built app's entry passes
		 * the current route's, so hydration matches the static HTML. */
		preloaded?: Record<string, Component>;
		/** Dev only: the note editor writes to the project's source. */
		dev?: boolean;
	}

	let { doc, activeStylesheet, pageModules = {}, preloaded = {}, dev = false }: Props = $props();

	const meta = $derived(doc.meta);
	const toc = $derived(doc.toc ?? []);

	// The page body compiles to its own component (prose + islands + example
	// markers); it renders here, natively — sdocs styling, no iframe. Only the
	/** Stage heights the reader dragged to, by example slug; absent means the
	 * stage still sizes itself to its content. */
	let stageHeights = $state<Record<string, number>>({});
	$effect(() => {
		void doc.entitySlug;
		stageHeights = {};
	});

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

	const narrow = $derived(isNarrow());
	const viewPadding = $derived(narrow ? capSidePadding(doc.padding) : doc.padding);
</script>

<!-- Resolves a {@render __sdocsGlossary?.(i)} marker the parser left in the
     prose, so a glossary renders exactly where it was written — the same
     mechanism an [EXAMPLE] mid-prose already uses. -->
{#snippet glossaryBlock(index: number)}
	{@const glossary = doc.glossaries?.[index]}
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
{/snippet}

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
				{#each example.notes ?? [] as entry, i (i)}
					<Note text={entry.note} type={entry.type} />
				{/each}
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
			{/if}
			<div class="sdocs-panels">
				<div class="sdocs-preview-wrapper">
					<PreviewFrame
						src={example.previewUrl ?? ''}
						{activeStylesheet}
						stage={example}
						height={stageHeights[example.slug] ?? null}
					/>
					<!-- Inside the wrapper, flush against the frame it resizes. -->
					<HeightHandle
						height={stageHeights[example.slug] ?? null}
						onchange={(h) => (stageHeights[example.slug] = h)}
						onreset={() => {
							const next = { ...stageHeights };
							delete next[example.slug];
							stageHeights = next;
						}}
					/>
				</div>
				{#if example.showCode !== false}
					<CollapsiblePanel title="Code" defaultExpanded={false} flush>
						<div class="sdocs-code-block" {@attach copyCode()}>
							{@html example.highlightedHtml ?? ''}
						</div>
					</CollapsiblePanel>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

<div class="sdocs-page-view" style:padding={viewPadding}>
	<!-- maxWidth constrains the whole column — content plus toc; contentX
	     places it. Without a toc the content takes the toc's space. -->
	<div class="sdocs-page-inner" style:max-width={doc.maxWidth} style:margin={columnMargin}>
		<div class="sdocs-page-main">
			<!-- Header: a body `#` heading takes over as the page title -->
			{#if !doc.bodyTitle}
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
					{#each meta.notes ?? [] as entry, i (i)}
						<Note text={entry.note} type={entry.type} />
					{/each}
					{#if meta.todos?.length}
						<TodoList items={meta.todos} {dev} file={doc.filePath} entitySlug={doc.entitySlug} />
					{/if}
				</div>
			{:else}
				<!-- The body's own heading is the title, and it is inside the
				     rendered markdown — nothing here to hang a button off, so
				     it takes the corner instead. -->
				<NoteControl
					{dev}
					variant="corner"
					label={displayTitle(meta.title)}
					file={doc.filePath}
					entitySlug={doc.entitySlug}
					notes={meta.notes ?? []}
					todos={meta.todos ?? []}
				/>
			{/if}
			{#if doc.bodyTitle && (meta.notes?.length || meta.todos?.length)}
				<!-- The body's own `#` is the title here, and it lives inside the
				     rendered markdown — so the notes and the todo take the place
				     the header would have had, just above it. -->
				<div class="sdocs-doc-note">
					{#each meta.notes ?? [] as entry, i (i)}
						<Note text={entry.note} type={entry.type} />
					{/each}
					{#if meta.todos?.length}
						<TodoList items={meta.todos} {dev} file={doc.filePath} entitySlug={doc.entitySlug} />
					{/if}
				</div>
			{/if}

			<!-- Content -->
			<div class="sdocs-page-content sdocs-prose" bind:this={container} {@attach copyCode()}>
				{#if PageComponent}
					<PageComponent __sdocsExample={exampleFrame} __sdocsGlossary={glossaryBlock} />
				{/if}
			</div>
		</div>

		<!-- Table of Contents -->
		{#if toc.length > 0 && doc.showToc !== false}
			{#snippet tocList()}
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
			{/snippet}
			{#if narrow}
				<!-- No column to sit sticky in: the outline folds up above the
				     page rather than pushing the first paragraph off-screen. -->
				<details class="sdocs-toc sdocs-toc-collapsed">
					<summary class="sdocs-toc-summary">
						<Icon name="chevron-right" --w="14px" --h="14px" />
						On this page
					</summary>
					{@render tocList()}
				</details>
			{:else}
				<aside class="sdocs-toc">
					<h3 class="sdocs-toc-title">On this page</h3>
					{@render tocList()}
				</aside>
			{/if}
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
		/* The containing block for the corner note control. Without it that
		   control resolves `top: 0` against the app root and its 120×52 hover
		   zone lands over the top bar, swallowing clicks meant for fullscreen
		   and the kebab menu. */
		position: relative;
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
	.sdocs-view-header :global(.Note),
	.sdocs-doc-note {
		margin: 10px 0 14px;
	}
	.sdocs-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sdocs-view-description {
		font-size: 14px;
		line-height: 1.5;
		color: var(--color-base-500);
		margin: 6px 0 0;
	}

	/* ── Page prose: the docs app's own typography ── */
	.sdocs-glossary-block {
		margin: 1.2em 0;
	}
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

	@media (max-width: 860px) {
		/* One column: the outline stacks above the prose instead of beside it. */
		.sdocs-page-inner {
			flex-direction: column;
			gap: 16px;
		}
		.sdocs-toc-collapsed {
			order: -1;
			width: auto;
			position: static;
			/* The sticky column's flex-start would shrink it to its own text,
			   leaving a floating box that doesn't line up with the prose. */
			align-self: stretch;
			padding: 8px 12px;
			border: 1px solid var(--color-base-200);
			border-radius: 8px;
		}
		.sdocs-toc-summary {
			min-height: 28px;
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 12px;
			font-weight: 600;
			letter-spacing: 0.05em;
			text-transform: uppercase;
			color: var(--color-base-500);
			cursor: pointer;
			/* `display: flex` drops the native marker — the chevron replaces it. */
			list-style: none;
		}
		.sdocs-toc-summary::-webkit-details-marker {
			display: none;
		}
		.sdocs-toc-summary :global(.Icon) {
			transition: transform 0.15s ease;
		}
		.sdocs-toc-collapsed[open] .sdocs-toc-summary :global(.Icon) {
			transform: rotate(90deg);
		}
		.sdocs-toc-collapsed[open] .sdocs-toc-summary {
			margin-bottom: 4px;
		}
		.sdocs-toc-link {
			padding: 8px 0;
			font-size: 14px;
		}
		.sdocs-view-title {
			font-size: 20px;
		}
		.sdocs-view-header {
			margin-bottom: 16px;
		}
	}
</style>
