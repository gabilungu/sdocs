<!--
	A `[TODO]` block: a nested checklist, rendered wherever its entity or
	example is.

	The checkbox is live under `sdocs dev` and disabled in a build. A built site
	has nowhere to put a tick — the source is not there to write to — and a
	checkbox that forgets on reload is worse than one that says it is read-only.
-->
<script lang="ts">
	import type { TodoItem } from '../../types.js';
	import { renderInlineMarkdown } from './format.js';

	interface Props {
		items: TodoItem[];
		/** Off in a build: the endpoint behind a tick exists only in dev. */
		dev?: boolean;
		file: string;
		entitySlug: string;
		exampleTitle?: string | null;
	}

	let { items, dev = false, file, entitySlug, exampleTitle = null }: Props = $props();

	/** Ticks the reader made, by path, until Vite reloads the file under them.
	 * The source is the truth; this only keeps the box from flicking back
	 * while the write is in flight. */
	let pending = $state<Record<string, boolean>>({});
	let error = $state<string | null>(null);

	async function toggle(path: number[], done: boolean) {
		const key = path.join('.');
		pending[key] = done;
		error = null;
		try {
			const response = await fetch('/__sdocs/todo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file, entitySlug, exampleTitle, path, done }),
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error ?? `The dev server refused the tick (${response.status}).`);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			delete pending[key];
		}
	}

	function count(list: TodoItem[]): number {
		return list.reduce((n, item) => n + 1 + count(item.children), 0);
	}
	function countDone(list: TodoItem[]): number {
		return list.reduce((n, item) => n + (item.done ? 1 : 0) + countDone(item.children), 0);
	}

	const total = $derived(count(items));
	const done = $derived(countDone(items));
</script>

{#snippet list(nodes: TodoItem[], path: number[])}
	<ul class="sdocs-todo-list">
		{#each nodes as item, i (i)}
			{@const here = [...path, i]}
			{@const checked = pending[here.join('.')] ?? item.done}
			<li class="sdocs-todo-item" class:is-done={checked}>
				<label class="sdocs-todo-line">
					<input
						type="checkbox"
						{checked}
						disabled={!dev}
						onchange={(e) => toggle(here, e.currentTarget.checked)}
					/>
					<span class="sdocs-todo-text">{@html renderInlineMarkdown(item.text)}</span>
				</label>
				{#if item.children.length}
					{@render list(item.children, here)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#if items.length}
	<div class="sdocs-todo" class:is-static={!dev}>
		<div class="sdocs-todo-head">
			<span class="sdocs-todo-label">Todo</span>
			<span class="sdocs-todo-count">{done}/{total}</span>
		</div>
		{@render list(items, [])}
		{#if error}
			<p class="sdocs-todo-error">{error}</p>
		{/if}
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
		color: var(--color-base-500);
	}

	.sdocs-todo-count {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--color-base-500);
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

	.sdocs-todo:not(.is-static) .sdocs-todo-line {
		cursor: pointer;
	}

	.sdocs-todo-line input {
		flex: none;
		transform: translateY(1px);
		margin: 0;
		accent-color: var(--color-action-500);
	}

	.is-done > .sdocs-todo-line .sdocs-todo-text {
		color: var(--color-base-500);
		text-decoration: line-through;
	}

	.sdocs-todo-error {
		margin: 0;
		font-size: 12px;
		color: var(--color-danger-700);
	}
</style>
