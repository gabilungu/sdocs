<script>
	/**
	 * @cssvar {color} --notice-accent - Accent border and title color (default: hsl(221 83% 53%))
	 * @cssvar {color} --notice-bg - Background color (default: hsl(240 5% 97%))
	 * @cssvar {dimension} --notice-radius - Corner radius (default: 10px)
	 * @cssvar {dimension} --notice-pad - Inner padding (default: 14px)
	 */

	/**
	 * @typedef {Object} NoticeAction
	 * @property {string} label - Button label
	 * @property {() => void} [onclick] - Called when the action is clicked
	 */

	/**
	 * @typedef {Object} Props
	 * @property {string} title - Heading of the notice
	 * @property {'info' | 'success' | 'warning' | 'danger'} [tone] - Visual tone of the dot next to the title
	 * @property {boolean} [dismissible] - Show the dismiss button
	 * @property {number} [count] - Badge with the number of occurrences
	 * @property {NoticeAction} [action] - Optional action button rendered under the body
	 * @property {() => void} [ondismiss] - Called when the notice is dismissed
	 * @property {(shows: number) => void} [onshow] - Called when the notice is shown again, with the total show count
	 * @property {import('svelte').Snippet<[tone: string]>} [icon] - Leading icon; receives the current tone
	 * @property {import('svelte').Snippet} children - Body content
	 */

	/** @type {Props} */
	let { title, tone = 'info', dismissible = true, count = 1, action, ondismiss, onshow, icon, children } = $props();

	let visible = $state(true);

	/** Live counters: how often the notice was shown and dismissed */
	export const stats = $state({ shows: 1, dismissals: 0 });

	/** Hide the notice */
	export function dismiss() {
		if (!visible) return;
		visible = false;
		stats.dismissals += 1;
		ondismiss?.();
	}

	/** Show the notice again */
	export function show() {
		if (visible) return;
		visible = true;
		stats.shows += 1;
		onshow?.(stats.shows);
	}
</script>

{#if visible}
	<div class="notice">
		{#if icon}
			<span class="icon">{@render icon(tone)}</span>
		{:else}
			<span class="dot {tone}" aria-hidden="true"></span>
		{/if}
		<div class="content">
			<span class="title">
				{title}
				{#if count > 1}<span class="count">×{count}</span>{/if}
			</span>
			<div class="body">{@render children()}</div>
			{#if action}
				<button class="action" onclick={action.onclick}>{action.label}</button>
			{/if}
		</div>
		{#if dismissible}
			<button class="dismiss" onclick={dismiss} aria-label="Dismiss">✕</button>
		{/if}
	</div>
{:else}
	<button class="restore" onclick={show}>Show notice again</button>
{/if}

<style>
	.notice {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		min-width: 20rem;
		padding: var(--notice-pad, 14px);
		border: 1px solid hsl(240 6% 90%);
		border-left: 3px solid var(--notice-accent, hsl(221 83% 53%));
		border-radius: var(--notice-radius, 10px);
		background: var(--notice-bg, hsl(240 5% 97%));
	}

	.icon {
		line-height: 1.2;
	}

	.dot {
		width: 10px;
		height: 10px;
		margin-top: 5px;
		border-radius: 50%;
	}

	.dot.info {
		background: hsl(221 83% 53%);
	}
	.dot.success {
		background: hsl(142 71% 45%);
	}
	.dot.warning {
		background: hsl(38 92% 50%);
	}
	.dot.danger {
		background: hsl(0 84% 60%);
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		font-weight: 600;
		color: var(--notice-accent, hsl(221 83% 53%));
	}

	.count {
		margin-left: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		color: hsl(240 4% 46%);
	}

	.body {
		font-size: 0.9375rem;
		color: hsl(240 6% 25%);
	}

	.action {
		align-self: flex-start;
		margin-top: 4px;
		padding: 0.25rem 0.625rem;
		border: 1px solid hsl(240 6% 85%);
		border-radius: 6px;
		background: #fff;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(240 6% 25%);
		cursor: pointer;
	}

	.dismiss {
		border: 0;
		background: none;
		font: inherit;
		font-size: 0.875rem;
		color: hsl(240 4% 46%);
		cursor: pointer;
	}

	.restore {
		padding: 0.375rem 0.875rem;
		border: 1px dashed hsl(240 6% 80%);
		border-radius: 8px;
		background: none;
		font: inherit;
		font-size: 0.875rem;
		color: hsl(240 4% 46%);
		cursor: pointer;
	}
</style>
