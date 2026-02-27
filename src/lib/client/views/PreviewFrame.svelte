<script lang="ts">
	import { onMount, untrack } from 'svelte';

	interface Props {
		src: string;
		props?: Record<string, unknown>;
		cssVars?: Record<string, string>;
		activeStylesheet?: string;
		fullHeight?: boolean;
	}

	let { src, props = {}, cssVars = {}, activeStylesheet, fullHeight = false }: Props = $props();
	let iframe: HTMLIFrameElement;
	let ready = $state(false);
	let contentHeight = $state(0);

	onMount(() => {
		function onMessage(e: MessageEvent) {
			if (e.data?.type === 'sdocs:preview-ready') {
				ready = true;
				sendProps();
				sendCss();
				sendStylesheet();
			}
			if (e.data?.type === 'sdocs:resize' && e.source === iframe?.contentWindow) {
				contentHeight = e.data.height;
			}
		}
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	function sendProps() {
		if (ready && iframe?.contentWindow) {
			// Snapshot to strip $state proxy before postMessage (DataCloneError)
			const data = $state.snapshot(props);
			iframe.contentWindow.postMessage({ type: 'sdocs:update-props', props: data }, '*');
		}
	}

	function sendCss() {
		if (ready && iframe?.contentWindow) {
			const data = $state.snapshot(cssVars);
			iframe.contentWindow.postMessage({ type: 'sdocs:update-css', vars: data }, '*');
		}
	}

	function sendStylesheet() {
		if (ready && iframe?.contentWindow && activeStylesheet) {
			iframe.contentWindow.postMessage({ type: 'sdocs:update-stylesheet', name: activeStylesheet }, '*');
		}
	}

	$effect(() => {
		// Track props changes, send without re-tracking inside send
		JSON.stringify(props);
		untrack(() => sendProps());
	});

	$effect(() => {
		// Track cssVars changes
		JSON.stringify(cssVars);
		untrack(() => sendCss());
	});

	$effect(() => {
		// Track stylesheet changes
		activeStylesheet;
		untrack(() => sendStylesheet());
	});
</script>

<div class="sdocs-preview-frame" class:full-height={fullHeight}>
	<iframe
		bind:this={iframe}
		{src}
		title="Component preview"
		class="sdocs-iframe"
		scrolling="no"
		style:height={contentHeight ? `${contentHeight}px` : undefined}
	></iframe>
</div>

<style>
	.sdocs-preview-frame {
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		overflow: hidden;
		background: var(--color-base-0);
	}
	.sdocs-preview-frame.full-height {
		flex: 1;
		border: none;
		border-radius: 0;
	}
	.sdocs-iframe {
		width: 100%;
		max-height: 800px;
		overflow-y: auto;
		border: none;
		display: block;
	}
	.full-height .sdocs-iframe {
		height: 100%;
		min-height: 0;
	}
</style>
