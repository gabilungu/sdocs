<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	// A two-pane split with a draggable handle bar (drag, arrow keys, Home/End).
	// `leftWidth` is bindable and reads back the pixel size while dragging.
	interface Props extends HTMLAttributes<HTMLDivElement> {
		/** First pane — left (horizontal) or top (vertical). */
		left: Snippet;
		/** Second pane — right (horizontal) or bottom (vertical). */
		right: Snippet;
		/** Split axis. Default: 'horizontal'. */
		direction?: 'horizontal' | 'vertical';
		/** How the pane contents sit: 'split' (each in its own pane, the default)
		 * or 'compare' — both anchored to the same origin so the panes reveal
		 * slices of overlaid content, like a before / after image slider. */
		mode?: 'split' | 'compare';
		/** First pane's size along the axis — the split position. Bindable:
		 * dragging (or the arrow keys) writes the new pixel size back. A number
		 * (px) or any CSS length. Default: '50%'. */
		leftWidth?: number | string;
		/** Thickness of the handle bar between the panes — a number (px) or any
		 * CSS length. Default: 8. */
		handleBarWidth?: number | string;
		/** Smallest the first pane can shrink to, in px. Default: 0. */
		leftMinWidth?: number;
		/** Smallest the second pane can shrink to, in px. Default: 0. With 0 the
		 * first pane can take the whole size and the bar spills past the edge. */
		rightMinWidth?: number;
		/** Overall width — 'fill' (the default), a number (px), or any CSS length. */
		width?: 'fill' | number | string;
		/** Overall height — 'fill' (the default), a number (px), or any CSS length. */
		height?: 'fill' | number | string;
	}

	let {
		left,
		right,
		direction = 'horizontal',
		mode = 'split',
		leftWidth = $bindable('50%'),
		handleBarWidth = 8,
		leftMinWidth = 0,
		rightMinWidth = 0,
		width = 'fill',
		height = 'fill',
		class: className = '',
		...rest
	}: Props = $props();

	const vertical = $derived(direction === 'vertical');

	// A number becomes px; a string passes through.
	const px = (v: number | string | undefined) =>
		v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;
	const size = (v: 'fill' | number | string) => (v === 'fill' ? '100%' : px(v));

	const resolvedWidth = $derived(size(width));
	const resolvedHeight = $derived(size(height));
	const resolvedLeftSize = $derived(px(leftWidth));
	const resolvedHandle = $derived(px(handleBarWidth));

	let track = $state<HTMLElement>();
	let leftPane = $state<HTMLElement>();
	let dragging = $state(false);
	// Both dimensions are tracked so the axis-specific value derives cleanly.
	let leftW = $state(0);
	let leftH = $state(0);
	let trackW = $state(0);
	let trackH = $state(0);

	$effect(() => {
		const l = leftPane;
		const t = track;
		if (!l || !t) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width: w, height: h } = entry.contentRect;
				if (entry.target === l) {
					leftW = Math.round(w);
					leftH = Math.round(h);
				} else if (entry.target === t) {
					trackW = Math.round(w);
					trackH = Math.round(h);
				}
			}
		});
		ro.observe(l);
		ro.observe(t);
		return () => ro.disconnect();
	});

	const measuredLeft = $derived(vertical ? leftH : leftW);
	const room = $derived(vertical ? trackH : trackW);
	const ariaMax = $derived(Math.max(leftMinWidth, room - rightMinWidth));

	const STEP = 16;
	const STEP_LARGE = 64;

	function trackSize() {
		const r = track?.getBoundingClientRect();
		return r ? (vertical ? r.height : r.width) : Infinity;
	}
	function paneSize() {
		const r = leftPane?.getBoundingClientRect();
		return r ? (vertical ? r.height : r.width) : 0;
	}

	// The first pane spans [leftMinWidth, room - rightMinWidth]. Space for the bar
	// is *not* reserved, so with rightMinWidth 0 the first pane fills the whole
	// size and the bar spills past the edge.
	function commit(next: number) {
		const min = leftMinWidth;
		const max = Math.max(min, trackSize() - rightMinWidth);
		leftWidth = Math.round(Math.min(Math.max(next, min), max));
	}

	function onPointerDown(event: PointerEvent) {
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		dragging = true;
		const start = vertical ? event.clientY : event.clientX;
		const startSize = paneSize();

		function onMove(move: PointerEvent) {
			const pos = vertical ? move.clientY : move.clientX;
			commit(startSize + (pos - start));
		}
		function onUp(up: PointerEvent) {
			dragging = false;
			handle.releasePointerCapture(up.pointerId);
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
		}
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	}

	function onKeyDown(event: KeyboardEvent) {
		const current = paneSize();
		const step = event.shiftKey ? STEP_LARGE : STEP;
		const grow = vertical ? 'ArrowDown' : 'ArrowRight';
		const shrink = vertical ? 'ArrowUp' : 'ArrowLeft';
		let next: number | undefined;
		if (event.key === grow) next = current + step;
		else if (event.key === shrink) next = current - step;
		else if (event.key === 'Home') next = leftMinWidth;
		else if (event.key === 'End') next = trackSize() - rightMinWidth;
		else return;
		event.preventDefault();
		commit(next);
	}
</script>

<div
	{...rest}
	bind:this={track}
	class="TwoPaneSplit {className}"
	data-direction={direction}
	data-mode={mode}
	data-dragging={dragging}
	style:width={resolvedWidth}
	style:height={resolvedHeight}
	style:--_room={`${room}px`}
>
	<div
		class="TwoPaneSplit-left"
		bind:this={leftPane}
		style:width={vertical ? undefined : resolvedLeftSize}
		style:height={vertical ? resolvedLeftSize : undefined}
	>
		<div class="TwoPaneSplit-content">{@render left()}</div>
	</div>

	<!-- The bar is the in-flow spacer / visible divider between the panes. -->
	<div
		class="TwoPaneSplit-bar"
		style:width={vertical ? undefined : resolvedHandle}
		style:height={vertical ? resolvedHandle : undefined}
	>
		<!-- The handle rides on top of everything (its own z-index), a sibling of
		     the panes, so their overflow clip never touches it. -->
		<div
			class="TwoPaneSplit-handle"
			role="slider"
			aria-label="Resize panes"
			aria-orientation={vertical ? 'vertical' : undefined}
			aria-valuenow={measuredLeft}
			aria-valuemin={leftMinWidth}
			aria-valuemax={ariaMax}
			tabindex="0"
			onpointerdown={onPointerDown}
			onkeydown={onKeyDown}
		>
			<span class="TwoPaneSplit-grip"></span>
		</div>
	</div>

	<div class="TwoPaneSplit-right">
		<div class="TwoPaneSplit-content">{@render right()}</div>
	</div>
</div>

<style>
	.TwoPaneSplit {
		display: flex;
		box-sizing: border-box;
		min-width: 0;
		min-height: 0;
		/* The bar + handle may spill past the edge when a pane fills the size —
		   don't clip them here. */
		overflow: visible;
	}
	.TwoPaneSplit[data-direction='vertical'] {
		flex-direction: column;
	}
	.TwoPaneSplit[data-dragging='true'][data-direction='horizontal'] {
		cursor: col-resize;
	}
	.TwoPaneSplit[data-dragging='true'][data-direction='vertical'] {
		cursor: row-resize;
	}
	.TwoPaneSplit[data-dragging='true'] {
		user-select: none;
	}

	.TwoPaneSplit-left,
	.TwoPaneSplit-right {
		position: relative;
		box-sizing: border-box;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.TwoPaneSplit-left {
		flex-shrink: 0;
		background: var(--leftBg, none);
	}
	.TwoPaneSplit-right {
		flex: 1;
		background: var(--rightBg, none);
	}

	.TwoPaneSplit-content {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	/* Compare mode: both contents anchor to the track origin at the full track
	   size, so each pane reveals a slice — a before / after slider. */
	.TwoPaneSplit[data-mode='compare'][data-direction='horizontal'] .TwoPaneSplit-content {
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--_room);
		height: auto;
	}
	.TwoPaneSplit[data-mode='compare'][data-direction='horizontal'] .TwoPaneSplit-left .TwoPaneSplit-content {
		left: 0;
	}
	.TwoPaneSplit[data-mode='compare'][data-direction='horizontal'] .TwoPaneSplit-right .TwoPaneSplit-content {
		right: 0;
	}
	.TwoPaneSplit[data-mode='compare'][data-direction='vertical'] .TwoPaneSplit-content {
		position: absolute;
		left: 0;
		right: 0;
		height: var(--_room);
		width: auto;
	}
	.TwoPaneSplit[data-mode='compare'][data-direction='vertical'] .TwoPaneSplit-left .TwoPaneSplit-content {
		top: 0;
	}
	.TwoPaneSplit[data-mode='compare'][data-direction='vertical'] .TwoPaneSplit-right .TwoPaneSplit-content {
		bottom: 0;
	}

	/* In-flow spacer; carries the divider colour. */
	.TwoPaneSplit-bar {
		position: relative;
		flex-shrink: 0;
		background: var(--handleBg, var(--color-base-100));
		transition: background 0.12s ease;
	}
	.TwoPaneSplit-bar:hover,
	.TwoPaneSplit[data-dragging='true'] .TwoPaneSplit-bar {
		background: var(--hoverHandleBg, var(--color-base-200));
	}

	/* Wider than the bar for an easy grab, centred over it, above everything. */
	.TwoPaneSplit-handle {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		/* Let the pointer drag work on touch instead of scrolling. */
		touch-action: none;
	}
	.TwoPaneSplit[data-direction='horizontal'] .TwoPaneSplit-handle {
		top: 0;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 16px;
		cursor: col-resize;
	}
	.TwoPaneSplit[data-direction='vertical'] .TwoPaneSplit-handle {
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		height: 16px;
		cursor: row-resize;
	}

	.TwoPaneSplit-grip {
		border-radius: 999px;
		background: var(--handleColor, var(--color-base-400));
		transition: background 0.12s ease;
	}
	.TwoPaneSplit[data-direction='horizontal'] .TwoPaneSplit-grip {
		width: 2px;
		height: 24px;
	}
	.TwoPaneSplit[data-direction='vertical'] .TwoPaneSplit-grip {
		width: 24px;
		height: 2px;
	}
	.TwoPaneSplit-handle:hover .TwoPaneSplit-grip,
	.TwoPaneSplit-handle:focus-visible .TwoPaneSplit-grip,
	.TwoPaneSplit[data-dragging='true'] .TwoPaneSplit-grip {
		background: var(--hoverHandleColor, var(--color-base-600));
	}
	.TwoPaneSplit-handle:focus-visible {
		outline: 2px solid var(--color-action-500);
		outline-offset: -2px;
		border-radius: 2px;
	}
</style>
