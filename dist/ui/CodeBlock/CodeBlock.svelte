<script lang="ts">
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';

	interface Props {
		/** Code string to display */
		code: string;
	}

	let { code }: Props = $props();

	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout>;

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			const textarea = document.createElement('textarea');
			textarea.value = code;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		}
	}
</script>

<div class="CodeBlock">
	<button type="button" class="CodeBlock-copy" onclick={copyCode} class:copied>
		{#if copied}
			<Check size={14} strokeWidth={2} />
		{:else}
			<Copy size={14} strokeWidth={1.75} />
		{/if}
	</button>
	<pre><code>{code}</code></pre>
</div>

<style>
	.CodeBlock {
		position: relative;
		width: 100%;
		box-sizing: border-box;
		background: var(--base-800);
		border-radius: 0;
		overflow: hidden;
		border: none;
		padding: 12px 16px;
		padding-right: 48px;
	}

	.CodeBlock-copy {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: var(--base-800);
		border: none;
		border-radius: 6px;
		color: var(--base-400);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.CodeBlock-copy:hover {
		background: var(--base-700);
		color: var(--base-200);
	}

	.CodeBlock-copy.copied {
		color: var(--success-400);
	}

	pre {
		margin: 0;
		overflow-x: auto;
	}

	code {
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.2;
		color: var(--base-50);
		white-space: pre;
	}
</style>
