<script lang="ts">
	/**
	 * The bar under a stage that sets its height.
	 *
	 * A stage sizes itself to its content, which is right until it isn't — a
	 * dropdown that opens downward, a list meant to scroll, a component whose
	 * empty state is two lines and whose full state is forty. Dragging this
	 * pins a height; the readout beside it puts the stage back on its content.
	 *
	 * The width handle is `TwoPaneSplit`, which earns its keep by having a
	 * second pane to reveal. There is nothing below a stage to reveal, so this
	 * is the smaller thing: one bar, one axis.
	 */

	interface Props {
		/** The pinned height in px, or null while the stage sizes itself. */
		height: number | null;
		onchange: (height: number) => void;
		onreset: () => void;
	}

	let { height, onchange, onreset }: Props = $props();

	/** Below this a stage is a sliver with nothing readable in it. */
	const MIN = 40;
	const STEP = 16;
	const STEP_LARGE = 64;

	let root = $state<HTMLElement>();

	/** What the stage above measures right now, so a drag starts where the
	 * stage looks rather than jumping. The handle sits directly under it, so
	 * the stage is simply the element before this one — which saves every
	 * caller from threading a measurement down. */
	function measured(): number {
		const stage = root?.previousElementSibling as HTMLElement | null;
		return stage ? Math.round(stage.getBoundingClientRect().height) : MIN;
	}

	let dragging = $state(false);

	function commit(next: number) {
		onchange(Math.max(MIN, Math.round(next)));
	}

	function onPointerDown(event: PointerEvent) {
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		dragging = true;
		const startY = event.clientY;
		const startHeight = height ?? measured();

		function onMove(move: PointerEvent) {
			commit(startHeight + (move.clientY - startY));
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
		const current = height ?? measured();
		const step = event.shiftKey ? STEP_LARGE : STEP;
		if (event.key === 'ArrowDown') commit(current + step);
		else if (event.key === 'ArrowUp') commit(current - step);
		else if (event.key === 'Home') onreset();
		else return;
		event.preventDefault();
	}
</script>

<div class="sdocs-height-handle" bind:this={root} data-dragging={dragging}>
	<div
		class="sdocs-height-bar"
		role="slider"
		aria-label="Resize stage height"
		aria-orientation="vertical"
		aria-valuenow={height ?? measured()}
		aria-valuemin={MIN}
		tabindex="0"
		onpointerdown={onPointerDown}
		onkeydown={onKeyDown}
	>
		<span class="sdocs-height-grip"></span>
	</div>
	{#if height !== null}
		<button class="sdocs-height-readout" title="Reset height" onclick={onreset}>
			{height}px
		</button>
	{/if}
</div>

<style>
	/* Sits directly under the stage, out of the way until the pointer is on
	   it — the same bargain the width bar strikes. */
	.sdocs-height-handle {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 10px;
	}
	.sdocs-height-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: transparent;
		cursor: row-resize;
		transition: background 0.12s ease;
		/* Let the pointer drag on touch instead of scrolling the page. */
		touch-action: none;
	}
	.sdocs-height-bar:hover,
	.sdocs-height-handle[data-dragging='true'] .sdocs-height-bar {
		background: var(--color-base-100);
	}
	.sdocs-height-grip {
		width: 24px;
		height: 2px;
		border-radius: 999px;
		background: var(--color-base-300);
		transition: background 0.12s ease;
	}
	.sdocs-height-bar:hover .sdocs-height-grip,
	.sdocs-height-bar:focus-visible .sdocs-height-grip,
	.sdocs-height-handle[data-dragging='true'] .sdocs-height-grip {
		background: var(--color-base-600);
	}
	.sdocs-height-bar:focus-visible {
		outline: 2px solid var(--color-action-500);
		outline-offset: -2px;
		border-radius: 2px;
	}

	/* Beside the grip, not at the end of the row: the bar runs the full width
	   of the column, so a readout pinned right lands out past the stage in the
	   empty canvas, attached to nothing. Clicking it hands the stage back to
	   its content. */
	.sdocs-height-readout {
		position: absolute;
		left: calc(50% + 22px);
		top: 50%;
		transform: translateY(-50%);
		z-index: 3;
		padding: 2px 7px;
		border: 1px solid var(--color-base-150);
		border-radius: 4px;
		background: var(--color-base-0);
		font-family: var(--mono, monospace);
		font-size: 11px;
		color: var(--color-base-500);
		white-space: nowrap;
		cursor: pointer;
	}
	.sdocs-height-readout:hover {
		background: var(--color-base-50);
		color: var(--color-base-700);
	}
</style>
