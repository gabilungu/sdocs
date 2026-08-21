<script lang="ts">
	import type { NoteType } from '../../types.js';
	import { Icon } from '../Icon/index.js';

	interface Props {
		/** The note's text. */
		text: string;
		/** What it says about the page. Unset reads as a plain remark, in grey. */
		type?: NoteType | null;
		/** Show a dismiss button, and report the dismissal. For a note with
		 * nowhere of its own to sit — one laid over a layout — where staying
		 * put would mean covering the thing it is about. */
		onclose?: () => void;
	}

	let { text, type = null, onclose }: Props = $props();

	/** The glyph per type. An untyped note still gets the information mark: it
	 * is a remark, which is what that glyph means, only quieter. */
	const ICONS: Record<NoteType, string> = {
		bug: 'bug',
		a11y: 'accessibility',
		warning: 'triangle-alert',
		perf: 'zap',
		tip: 'lightbulb',
		info: 'info',
	};

	const icon = $derived(type ? ICONS[type] : 'info');
	/** The two defects get the assertive role; a caveat or a fact does not
	 * interrupt someone using a screen reader. */
	const assertive = $derived(type === 'bug' || type === 'a11y');
</script>

<div class="Note" data-type={type ?? 'none'} role={assertive ? 'alert' : 'note'}>
	<Icon name={icon} --w="16px" --h="16px" --fill="var(--noteAccent)" />
	<p class="Note-text">{text}</p>
	{#if onclose}
		<button class="Note-close" type="button" aria-label="Dismiss note" onclick={onclose}>
			<Icon name="x" --w="14px" --h="14px" --fill="var(--noteAccent)" />
		</button>
	{/if}
</div>

<style>
	/* One accent per intent, and everything else reads from it — the icon, the
	   rule, the text. `info` borrows the action ramp: it is the blue this
	   system already has, and a fifth near-identical ramp would only be one
	   more thing to keep in step.

	   Low numbers sit near the page's background and high ones near its text,
	   in either theme — so `-100` behind `-700` is a tint under readable text
	   in light mode and stays one when the ramps invert for dark. */
	.Note {
		--noteAccent: var(--color-base-400);
		--noteBg: var(--color-base-100);
		--noteText: var(--color-base-700);
		display: flex;
		/* The glyph sits against the middle of the text, however many lines it
		   runs to, rather than against the first one. */
		align-items: center;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		padding: 5px 11px;
		border-radius: 6px;
		/* The accent shows as a spine down the left rather than a full border:
		   a ring in the intent colour competes with the content beside it. */
		border-left: 3px solid var(--noteAccent);
		background: var(--noteBg);
		font-size: 13px;
		line-height: 1.5;
		color: var(--noteText);
	}
	/* Colour follows the ranking, not the topic: the two defects are red, the
	   two caveats amber, and the two helpful ones cool. A reader should be able
	   to tell how much a note costs them without reading the word. */
	.Note[data-type='bug'] {
		--noteAccent: var(--color-danger-500);
		--noteBg: var(--color-danger-100);
		--noteText: var(--color-danger-700);
	}
	/* a11y is a defect, so it shares the bug's ramp — one step softer, because
	   it is the narrower of the two rather than a second alarm. */
	.Note[data-type='a11y'] {
		--noteAccent: var(--color-danger-400);
		--noteBg: var(--color-danger-100);
		--noteText: var(--color-danger-700);
	}
	.Note[data-type='warning'] {
		--noteAccent: var(--color-warning-500);
		--noteBg: var(--color-warning-100);
		--noteText: var(--color-warning-700);
	}
	.Note[data-type='perf'] {
		--noteAccent: var(--color-amber-400);
		--noteBg: var(--color-amber-100);
		--noteText: var(--color-amber-700);
	}
	.Note[data-type='tip'] {
		--noteAccent: var(--color-success-500);
		--noteBg: var(--color-success-100);
		--noteText: var(--color-success-700);
	}
	.Note[data-type='info'] {
		--noteAccent: var(--color-action-500);
		--noteBg: var(--color-action-100);
		--noteText: var(--color-action-700);
	}

	.Note-text {
		flex: 1;
		min-width: 0;
		margin: 0;
		/* A note is written as prose, and a long one should read as prose. */
		overflow-wrap: anywhere;
	}

	.Note-close {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: none;
		cursor: pointer;
		opacity: 0.7;
	}
	.Note-close:hover {
		opacity: 1;
		background: color-mix(in oklch, var(--noteAccent) 15%, transparent);
	}
</style>
