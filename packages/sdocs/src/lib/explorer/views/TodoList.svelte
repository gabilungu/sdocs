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
		/** Off in a build: the endpoint behind an edit exists only in dev. */
		dev?: boolean;
		file: string;
		entitySlug: string;
		exampleTitle?: string | null;
	}

	let { items, dev = false, file, entitySlug, exampleTitle = null }: Props = $props();

	/** Edits made since the last render, by path, until Vite reloads the file
	 * underneath. The source is the truth; this only keeps a box from flicking
	 * back while the write is in flight. */
	let pending = $state<Record<string, boolean>>({});
	let error = $state<string | null>(null);
	/** The item being retitled, by path — one at a time, like a rename. */
	let editing = $state<string | null>(null);

	async function post(body: Record<string, unknown>) {
		error = null;
		try {
			const response = await fetch('/__sdocs/todo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file, entitySlug, exampleTitle, ...body }),
			});
			if (!response.ok) {
				const detail = await response.json().catch(() => ({}));
				throw new Error(detail.error ?? `The dev server refused the edit (${response.status}).`);
			}
			return true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			return false;
		}
	}

	async function toggle(path: number[], done: boolean) {
		const key = path.join('.');
		pending[key] = done;
		if (!(await post({ path, done }))) delete pending[key];
	}

	/** A copy of the tree with one item's text replaced, or removed when the
	 * text is emptied — an item that says nothing is a line the reader has to
	 * skip past. */
	function edited(list: TodoItem[], path: number[], text: string): TodoItem[] {
		const [i, ...rest] = path;
		return list.flatMap((item, index) => {
			if (index !== i) return [item];
			if (rest.length) return [{ ...item, children: edited(item.children, rest, text) }];
			// Removing a parent takes its children with it: they were nested
			// under something that no longer says anything.
			return text.trim() ? [{ ...item, text: text.trim() }] : [];
		});
	}

	async function rename(path: number[], text: string) {
		editing = null;
		const item = at(items, path);
		if (!item || item.text === text.trim()) return;
		await post({ items: edited(items, path, text) });
	}

	function at(list: TodoItem[], path: number[]): TodoItem | undefined {
		let item: TodoItem | undefined;
		for (const i of path) {
			item = (item ? item.children : list)[i];
			if (!item) return undefined;
		}
		return item;
	}

	/** A new item at the end of the root list, opened for typing. */
	async function add() {
		const next = [...items, { text: 'New item', done: false, children: [] }];
		if (await post({ items: next })) editing = String(next.length - 1);
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
				<div class="sdocs-todo-line">
					<!-- The box is its own label so the text beside it can be a
					     control of its own in dev; in a build the whole row is
					     the label, since there is nothing else to click. -->
					<label class="sdocs-todo-box">
						<input
							type="checkbox"
							{checked}
							disabled={!dev}
							onchange={(e) => toggle(here, e.currentTarget.checked)}
						/>
						{#if !dev}
							<span class="sdocs-todo-text">{@html renderInlineMarkdown(item.text)}</span>
						{/if}
					</label>
					{#if dev}
						{#if editing === here.join('.')}
							<!-- svelte-ignore a11y_autofocus -- what opened this exists
							     to put the cursor here -->
							<input
								class="sdocs-todo-input"
								type="text"
								value={item.text}
								autofocus
								onblur={(e) => rename(here, e.currentTarget.value)}
								onkeydown={(e) => {
									if (e.key === 'Enter') e.currentTarget.blur();
									if (e.key === 'Escape') editing = null;
								}}
							/>
						{:else}
							<button
								class="sdocs-todo-text sdocs-todo-edit"
								title="Edit this item"
								onclick={() => (editing = here.join('.'))}
							>{@html renderInlineMarkdown(item.text)}</button>
						{/if}
					{/if}
				</div>
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
			{#if dev}
				<button class="sdocs-todo-add" title="Add an item" onclick={add}>+</button>
			{/if}
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

	.sdocs-todo-line,
	.sdocs-todo-box {
		display: flex;
		/* Against the first line of the text, not the middle of a wrapped
		   item — the box belongs to the line it opens. */
		align-items: baseline;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--color-base-800);
	}

	.sdocs-todo-box {
		flex: none;
	}

	.sdocs-todo:not(.is-static) .sdocs-todo-box {
		cursor: pointer;
	}

	/* The editable text is a button, but reads as the line it replaces —
	   the cursor and the hover underline are the only signs. */
	.sdocs-todo-edit {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: text;
	}

	.sdocs-todo-edit:hover {
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
		text-decoration-color: var(--color-base-300);
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

	.sdocs-todo-add {
		margin-left: auto;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		font: inherit;
		font-size: 13px;
		line-height: 1;
		color: var(--color-base-600);
		cursor: pointer;
	}

	.sdocs-todo-add:hover {
		border-color: var(--color-base-300);
		color: var(--color-base-900);
	}

	/* The input takes the text's own metrics, so opening one does not shift
	   the line it replaces. */
	.sdocs-todo-input {
		flex: 1;
		min-width: 0;
		padding: 0 2px;
		border: none;
		border-bottom: 1px solid var(--color-action-500);
		background: none;
		font: inherit;
		color: var(--color-base-900);
		outline: none;
	}

	.sdocs-todo-error {
		margin: 0;
		font-size: 12px;
		color: var(--color-danger-700);
	}
</style>
