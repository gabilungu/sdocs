<script lang="ts">
	import type { DocNote, TodoItem } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import NoteEditor from './NoteEditor.svelte';

	interface Props {
		/** Off in a build: the endpoint behind Save exists only in dev. */
		dev?: boolean;
		label: string;
		file: string;
		entitySlug: string;
		exampleTitle?: string | null;
		notes?: DocNote[];
		/**
		 * `inline` rides at the end of a title row. `corner` is for the two
		 * views that show no title — a layout and a page fill the view, so the
		 * button hides in the top-right until the pointer (or focus) finds it,
		 * the way out of fullscreen does.
		 */
		variant?: 'inline' | 'corner';
		/** The target's [TODO] items — the button to start one shows only
		 * when there are none, since an existing block carries its own `+`. */
		todos?: TodoItem[];
	}

	let {
		dev = false,
		label,
		file,
		entitySlug,
		exampleTitle = null,
		notes = [],
		todos = [],
		variant = 'inline',
	}: Props = $props();

	let open = $state(false);
	let busy = $state(false);

	/** Start a [TODO] with one item, opened for typing where it renders.
	 * There is nothing to edit before the block exists, so this writes the
	 * first item rather than opening an editor for an empty list. */
	async function startTodo() {
		busy = true;
		try {
			await fetch('/__sdocs/todo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					file,
					entitySlug,
					exampleTitle,
					items: [{ text: 'New item', done: false, children: [] }],
				}),
			});
			// Vite reloads the file; the block renders with its own controls.
		} catch {
			// Dev-only endpoint — if it is unreachable there is nothing to say
			// here that the note editor does not already say on save.
		}
		busy = false;
	}
</script>

{#if dev}
	<div class="sdocs-note-control" data-variant={variant}>
		<button
			class="sdocs-note-open"
			onclick={() => (open = true)}
			title={notes.length ? `Edit notes (${notes.length})` : 'Add a note'}
			aria-label={notes.length ? 'Edit notes' : 'Add a note'}
		>
			<Icon name="sticky-note" --w="14px" --h="14px" --fill="currentColor" />
		</button>
		{#if todos.length === 0}
			<button
				class="sdocs-note-open"
				disabled={busy}
				onclick={startTodo}
				title="Add a todo list"
				aria-label="Add a todo list"
			>
				<Icon name="circle-check" --w="14px" --h="14px" --fill="currentColor" />
			</button>
		{/if}
	</div>

	{#if open}
		<NoteEditor
			{label}
			{file}
			{entitySlug}
			{exampleTitle}
			{notes}
			onclose={() => (open = false)}
		/>
	{/if}
{/if}

<style>
	.sdocs-note-control[data-variant='inline'] {
		/* Pushes itself to the end of the title row it sits in. */
		margin-left: auto;
		flex: none;
		display: inline-flex;
		gap: 2px;
	}
	/* The zone, not the button: a 26px target at zero opacity is one nobody
	   can find. Hovering anywhere in the corner brings it up, the same deal
	   the way out of fullscreen offers. */
	.sdocs-note-control[data-variant='corner'] {
		position: absolute;
		top: 0;
		right: 12px;
		width: 120px;
		height: 52px;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		pointer-events: none;
	}
	.sdocs-note-control[data-variant='corner'] .sdocs-note-open {
		pointer-events: auto;
	}

	.sdocs-note-open {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
		color: var(--color-base-400);
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			color 0.12s ease,
			background 0.12s ease;
	}
	.sdocs-note-open:hover {
		background: var(--color-base-100);
		color: var(--color-base-700);
	}

	/* A hot corner: invisible until the pointer or the keyboard reaches it, so
	   it never sits on top of the thing being previewed. */
	.sdocs-note-control[data-variant='corner'] .sdocs-note-open {
		opacity: 0;
		border-color: var(--color-base-200);
		background: var(--color-base-0);
	}
	.sdocs-note-control[data-variant='corner']:hover .sdocs-note-open,
	.sdocs-note-control[data-variant='corner'] .sdocs-note-open:focus-visible {
		opacity: 1;
	}
</style>
