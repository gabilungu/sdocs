<!--
	A `[TODO]` block: a nested checklist, rendered wherever its entity or
	example is.

	Read-only everywhere: a tick is an edit to the `.sdoc` source, made there.
-->
<script lang="ts">
	import type { TodoItem } from '../../types.js';
	import { renderInlineMarkdown } from './format.js';

	interface Props {
		items: TodoItem[];
	}

	let { items }: Props = $props();

	function count(list: TodoItem[]): number {
		return list.reduce((n, item) => n + 1 + count(item.children), 0);
	}
	function countDone(list: TodoItem[]): number {
		return list.reduce((n, item) => n + (item.done ? 1 : 0) + countDone(item.children), 0);
	}

	const total = $derived(count(items));
	const done = $derived(countDone(items));
</script>

{#snippet list(nodes: TodoItem[])}
	<ul class="sdocs-todo-list">
		{#each nodes as item, i (i)}
			<li class="sdocs-todo-item" class:is-done={item.done}>
				<label class="sdocs-todo-line">
					<input type="checkbox" checked={item.done} disabled />
					<span class="sdocs-todo-text">{@html renderInlineMarkdown(item.text)}</span>
				</label>
				{#if item.children.length}
					{@render list(item.children)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#if items.length}
	<div class="sdocs-todo">
		<div class="sdocs-todo-head">
			<span class="sdocs-todo-label">Todo</span>
			<span class="sdocs-todo-count">{done}/{total}</span>
		</div>
		{@render list(items)}
	</div>
{/if}

<style>
	/* Quieter than a [NOTES] alert on purpose: a checklist is working state,
	   not something the page is telling the reader. Low numbers sit near the
	   background and high ones near the text, in either theme. */
	.sdocs-todo {
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		padding: 10px 12px;
		border-radius: 6px;
		border-left: 3px solid var(--color-base-300);
		background: var(--color-base-50);
	}

	.sdocs-todo-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.sdocs-todo-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-base-600);
	}

	.sdocs-todo-count {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--color-base-600);
	}

	.sdocs-todo-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A nested list indents by the checkbox's own width, so a child's text
	   lines up under its parent's rather than under the box. */
	.sdocs-todo-item .sdocs-todo-list {
		margin-top: 2px;
		padding-left: 22px;
	}

	.sdocs-todo-line {
		display: flex;
		/* Against the first line of the text, not the middle of a wrapped
		   item — the box belongs to the line it opens. */
		align-items: baseline;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--color-base-800);
	}

	.sdocs-todo-line input {
		flex: none;
		transform: translateY(1px);
		margin: 0;
		accent-color: var(--color-action-500);
	}

	.is-done > .sdocs-todo-line .sdocs-todo-text {
		color: var(--color-base-600);
		text-decoration: line-through;
	}
</style>
