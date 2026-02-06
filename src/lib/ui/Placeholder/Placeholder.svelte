<script lang="ts">
	/**
	 * A Placeholder rectangle for visualizing layouts and empty spaces.
	 * Call `run()` to trigger a flash animation (useful for testing function props).
	 */
	interface Props {
		/** Text to display inside the Placeholder */
		text?: string;
		/** Border radius in pixels */
		radius?: number;
		/** Color variant */
		color?: 'pink' | 'green' | 'blue';
		/** Width (any CSS dimension) */
		width?: string;
		/** Height (any CSS dimension) */
		height?: string;
	}

	let { text, radius = 0, color = 'pink', width = '100%', height = '100%' }: Props = $props();

	let flashing = $state(false);
	let flashTimeout: ReturnType<typeof setTimeout>;

	export function bang() {
		clearTimeout(flashTimeout);
		flashing = true;
		flashTimeout = setTimeout(() => {
			flashing = false;
		}, 400);
	}
</script>

<div class="Placeholder {color}" class:flashing style:border-radius="{radius}px" style:width style:height>
	{#if text}
		<span class="Placeholder-text">{text}</span>
	{/if}
</div>

<style>
	.Placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.3s ease;
	}

	.Placeholder.flashing {
		opacity: 0.4;
		transition: none;
	}

	.Placeholder.pink {
		background: repeating-linear-gradient(
			-45deg,
			var(--pink-100),
			var(--pink-100) 8px,
			var(--pink-200) 8px,
			var(--pink-200) 12px
		);
	}

	.Placeholder.pink .Placeholder-text {
		color: var(--pink-500);
	}

	.Placeholder.green {
		background: repeating-linear-gradient(
			-45deg,
			var(--success-100),
			var(--success-100) 8px,
			var(--success-200) 8px,
			var(--success-200) 12px
		);
	}

	.Placeholder.green .Placeholder-text {
		color: var(--success-500);
	}

	.Placeholder.blue {
		background: repeating-linear-gradient(
			-45deg,
			var(--sky-100),
			var(--sky-100) 8px,
			var(--sky-200) 8px,
			var(--sky-200) 12px
		);
	}

	.Placeholder.blue .Placeholder-text {
		color: var(--sky-500);
	}

	.Placeholder-text {
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
	}
</style>
