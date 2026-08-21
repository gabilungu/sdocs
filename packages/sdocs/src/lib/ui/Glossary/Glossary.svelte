<!--
	A `[GLOSSARY]` block: a titled list of terms, rendered where it was written.

	The filter is off unless the author asks for it. A search over four terms is
	furniture — it costs a row of chrome and saves nothing — and the author is
	the only one who knows whether their list is four terms or forty.
-->
<script lang="ts">
	import type { GlossaryTerm } from '../../types.js';
	import { Icon } from '../Icon/index.js';
	import { renderInlineMarkdown } from '../../explorer/views/format.js';

	interface Props {
		terms: GlossaryTerm[];
		/** Heading above the list; nothing renders without one. */
		title?: string | null;
		/** A line under the title. */
		subtitle?: string | null;
		/** Show the filter box. */
		search?: boolean;
	}

	let { terms, title = null, subtitle = null, search = false }: Props = $props();

	let query = $state('');

	/** Matches the term or its definition, case-insensitively — the same
	 * substring rule the MCP server searches by, so "what finds it here" and
	 * "what finds it over there" have one answer. */
	const shown = $derived(
		query.trim()
			? terms.filter((t) =>
					`${t.term} ${t.definition}`.toLowerCase().includes(query.trim().toLowerCase()),
				)
			: terms,
	);
</script>

<section class="sdocs-glossary" aria-label={title ?? 'Glossary'}>
	{#if title || subtitle || search}
		<header class="sdocs-glossary-head">
			<div class="sdocs-glossary-heading">
				{#if title}
					<h3 class="sdocs-glossary-title">{title}</h3>
				{/if}
				{#if subtitle}
					<p class="sdocs-glossary-subtitle">{@html renderInlineMarkdown(subtitle)}</p>
				{/if}
			</div>
			{#if search}
				<label class="sdocs-glossary-search">
					<Icon name="fa-magnifying-glass" --w="12px" --h="12px" --fill="var(--color-base-400)" />
					<input
						type="search"
						bind:value={query}
						placeholder="Filter terms"
						aria-label="Filter terms"
					/>
				</label>
			{/if}
		</header>
	{/if}

	{#if shown.length}
		<dl class="sdocs-glossary-list">
			{#each shown as entry (entry.term)}
				<div class="sdocs-glossary-entry">
					<dt>{entry.term}</dt>
					<dd>{@html renderInlineMarkdown(entry.definition)}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<p class="sdocs-glossary-empty">No term matches “{query}”.</p>
	{/if}
</section>

<style>
	.sdocs-glossary {
		box-sizing: border-box;
		width: 100%;
		padding: 14px 16px;
		border: 1px solid var(--color-base-200);
		border-radius: 8px;
		background: var(--color-base-0);
	}

	.sdocs-glossary-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}

	.sdocs-glossary-heading {
		min-width: 0;
	}

	.sdocs-glossary-title {
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		color: var(--color-base-900);
	}

	.sdocs-glossary-subtitle {
		margin: 2px 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--color-base-500);
	}

	.sdocs-glossary-search {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
		padding: 0 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		background: var(--color-base-50);
	}

	.sdocs-glossary-search:focus-within {
		border-color: var(--color-action-500);
	}

	.sdocs-glossary-search input {
		width: 150px;
		padding: 5px 0;
		border: none;
		background: none;
		font: inherit;
		font-size: 13px;
		color: var(--color-base-900);
		outline: none;
	}

	/* Term over definition rather than beside it: a two-column list wraps badly
	   the moment a term is long, and the indent already says which is which. */
	.sdocs-glossary-list {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.sdocs-glossary-entry dt {
		font-size: 13px;
		font-weight: 650;
		color: var(--color-base-900);
	}

	.sdocs-glossary-entry dd {
		margin: 2px 0 0;
		max-width: 70ch;
		font-size: 13px;
		line-height: 1.6;
		color: var(--color-base-700);
	}

	.sdocs-glossary-empty {
		margin: 0;
		font-size: 13px;
		color: var(--color-base-500);
	}
</style>
