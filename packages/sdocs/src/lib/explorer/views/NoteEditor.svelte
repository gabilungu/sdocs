<script lang="ts">
	import type { DocNote, NoteIntent } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';

	interface Props {
		/** What the title bar names — the entity, or "Entity / Example". */
		label: string;
		/** The `.sdoc` this opener lives in. */
		file: string;
		entitySlug: string;
		/** Set to edit an `[example]`'s notes rather than the entity's. */
		exampleTitle?: string | null;
		/** The notes as they stand; edited on a copy until Save. */
		notes: DocNote[];
		onclose: () => void;
	}

	let { label, file, entitySlug, exampleTitle = null, notes, onclose }: Props = $props();

	const INTENTS: (NoteIntent | 'none')[] = ['none', 'info', 'success', 'warning', 'danger'];

	// A copy: closing the editor has to leave the page exactly as it was, and
	// the page is rendering the very array being edited.
	// svelte-ignore state_referenced_locally -- the snapshot is the point; the
	// editor opens on what was there and answers to nothing else until Save.
	let draft = $state(notes.map((n) => ({ ...n })));
	let saving = $state(false);
	let error = $state<string | null>(null);

	function add() {
		draft = [...draft, { note: '', intent: null }];
	}

	function remove(index: number) {
		draft = draft.filter((_, i) => i !== index);
	}

	async function save() {
		saving = true;
		error = null;
		// An empty note would be written as an entry that says nothing, and the
		// parser would reject the file the reader is looking at.
		const notes = draft.map((n) => ({ ...n, note: n.note.trim() })).filter((n) => n.note);
		try {
			const response = await fetch('/__sdocs/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file, entitySlug, exampleTitle, notes }),
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error ?? `The dev server refused the edit (${response.status}).`);
			}
			// The file changed; the page re-renders itself when Vite reloads it.
			onclose();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			saving = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') onclose();
	}}
/>

<!-- The scrim closes on a click outside; the dialog stops clicks reaching it. -->
<div
	class="sdocs-note-editor-scrim"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div class="sdocs-note-editor" role="dialog" aria-modal="true" aria-label="Notes for {label}">
		<header class="sdocs-note-editor-head">
			<h2>Notes</h2>
			<span class="sdocs-note-editor-target" title={label}>{label}</span>
			<button class="sdocs-note-editor-x" onclick={onclose} aria-label="Close">
				<Icon name="x" --w="14px" --h="14px" --fill="var(--color-base-500)" />
			</button>
		</header>

		<div class="sdocs-note-editor-body">
			{#each draft as entry, i (i)}
				<div class="sdocs-note-row">
					<select
						class="sdocs-note-intent"
						value={entry.intent ?? 'none'}
						onchange={(e) => {
							const picked = e.currentTarget.value;
							entry.intent = picked === 'none' ? null : (picked as NoteIntent);
						}}
						aria-label="Intent"
					>
						{#each INTENTS as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
					<!-- svelte-ignore a11y_autofocus -- the row was just added by
					     the reader; the caret belongs in it. -->
					<textarea
						class="sdocs-note-text"
						rows="2"
						placeholder="What should a reader know?"
						bind:value={entry.note}
						autofocus={entry.note === ''}
					></textarea>
					<button class="sdocs-note-remove" onclick={() => remove(i)} aria-label="Remove note">
						<Icon name="x" --w="13px" --h="13px" --fill="var(--color-base-500)" />
					</button>
				</div>
			{:else}
				<p class="sdocs-note-empty">No notes on this one yet.</p>
			{/each}

			<button class="sdocs-note-add" onclick={add}>Add a note</button>
		</div>

		{#if error}
			<p class="sdocs-note-editor-error">{error}</p>
		{/if}

		<footer class="sdocs-note-editor-foot">
			<span class="sdocs-note-editor-file">{file.split('/').pop()}</span>
			<button class="sdocs-note-btn" onclick={onclose}>Cancel</button>
			<button class="sdocs-note-btn is-primary" onclick={save} disabled={saving}>
				{saving ? 'Saving…' : 'Save'}
			</button>
		</footer>
	</div>
</div>

<style>
	.sdocs-note-editor-scrim {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: rgb(0 0 0 / 0.35);
	}
	.sdocs-note-editor {
		display: flex;
		flex-direction: column;
		width: min(560px, 100%);
		max-height: 100%;
		border-radius: 10px;
		background: var(--color-base-0);
		box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
		font-family: var(--sans);
	}
	.sdocs-note-editor-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-base-150);
	}
	.sdocs-note-editor-head h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--color-base-900);
	}
	.sdocs-note-editor-target {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--color-base-500);
	}
	.sdocs-note-editor-x {
		align-self: center;
		display: inline-flex;
		padding: 4px;
		border: 0;
		border-radius: 4px;
		background: none;
		cursor: pointer;
	}
	.sdocs-note-editor-x:hover {
		background: var(--color-base-100);
	}

	.sdocs-note-editor-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 16px;
	}
	.sdocs-note-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-bottom: 8px;
	}
	.sdocs-note-intent {
		flex: none;
		width: 92px;
		height: 28px;
		padding: 0 6px;
		border: 1px solid var(--color-base-200);
		border-radius: 5px;
		background: var(--color-base-50);
		font: inherit;
		font-size: 12px;
		color: var(--color-base-700);
	}
	.sdocs-note-text {
		flex: 1;
		min-width: 0;
		padding: 5px 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 5px;
		background: var(--color-base-0);
		font: inherit;
		font-size: 13px;
		line-height: 1.45;
		color: var(--color-base-900);
		resize: vertical;
	}
	.sdocs-note-remove {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: none;
		cursor: pointer;
	}
	.sdocs-note-remove:hover {
		background: var(--color-base-100);
	}
	.sdocs-note-empty {
		margin: 2px 0 10px;
		font-size: 13px;
		color: var(--color-base-500);
	}
	.sdocs-note-add {
		padding: 5px 10px;
		border: 1px dashed var(--color-base-250);
		border-radius: 5px;
		background: none;
		font: inherit;
		font-size: 12px;
		color: var(--color-base-600);
		cursor: pointer;
	}
	.sdocs-note-add:hover {
		border-style: solid;
		color: var(--color-base-900);
	}

	.sdocs-note-editor-error {
		margin: 0;
		padding: 8px 16px;
		font-size: 12px;
		color: var(--color-danger-700);
		background: var(--color-danger-100);
	}

	.sdocs-note-editor-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid var(--color-base-150);
	}
	.sdocs-note-editor-file {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--mono, monospace);
		font-size: 11px;
		color: var(--color-base-450);
	}
	.sdocs-note-btn {
		padding: 5px 12px;
		border: 1px solid var(--color-base-200);
		border-radius: 5px;
		background: var(--color-base-0);
		font: inherit;
		font-size: 12px;
		color: var(--color-base-700);
		cursor: pointer;
	}
	.sdocs-note-btn:hover {
		background: var(--color-base-50);
	}
	.sdocs-note-btn.is-primary {
		border-color: transparent;
		background: var(--color-action-500);
		color: var(--color-base-0);
	}
	.sdocs-note-btn.is-primary:hover {
		background: var(--color-action-600);
	}
	.sdocs-note-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
