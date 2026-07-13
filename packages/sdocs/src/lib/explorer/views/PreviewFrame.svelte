<script lang="ts">
	import { getContext, onMount, untrack } from 'svelte';

	interface Props {
		src: string;
		props?: Record<string, unknown>;
		cssVars?: Record<string, string>;
		activeStylesheet?: string;
		fullHeight?: boolean;
		/** Called with the preview component's exported state values whenever they change */
		onStateValues?: (values: Record<string, unknown>) => void;
		/** Called once the iframe reports ready (theme css loaded) */
		onready?: () => void;
	}

	let { src, props = {}, cssVars = {}, activeStylesheet, fullHeight = false, onStateValues, onready }: Props = $props();

	/** Invoke a zero-argument method on the preview's root component */
	export function callMethod(name: string): void {
		iframe?.contentWindow?.postMessage({ type: 'sdocs:call-method', name }, '*');
	}

	/** Resolve a CSS color value — including var() references — against the
	 * preview document, where the project's theme css actually lives. Returns
	 * a #rrggbb hex for the native color input, or null when unresolvable.
	 * Same-origin holds for dev and built previews alike. */
	export function resolveColor(value: string): string | null {
		const doc = iframe?.contentDocument;
		if (!doc?.body) return null;
		const probe = doc.createElement('div');
		probe.style.color = value;
		doc.body.appendChild(probe);
		const rgb = doc.defaultView?.getComputedStyle(probe).color ?? '';
		probe.remove();
		const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (!m) return null;
		return (
			'#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')
		);
	}

	// Preview URLs are root-absolute; hosts serving under a sub-path pass the
	// prefix via the Explorer's previewBase prop (see Explorer.svelte).
	const previewBase = (getContext('sdocs-preview-base') as string | undefined) ?? '';
	const resolvedSrc = $derived(previewBase.replace(/\/$/, '') + src);
	let iframe: HTMLIFrameElement;
	let ready = $state(false);
	let contentHeight = $state(0);

	// Component previews grow the frame to their content and let the outer view
	// scroll. A LAYOUT is a full-page canvas: it fills the viewport height and
	// scrolls inside the frame like a browser window, so ignore the reported
	// content height there.
	const frameHeight = $derived(
		fullHeight ? undefined : contentHeight ? `${contentHeight}px` : undefined
	);

	onMount(() => {
		function onMessage(e: MessageEvent) {
			if (e.data?.type === 'sdocs:preview-ready') {
				ready = true;
				sendProps();
				sendCss();
				sendStylesheet();
				onready?.();
			}
			if (e.data?.type === 'sdocs:resize' && e.source === iframe?.contentWindow) {
				contentHeight = e.data.height;
			}
			if (e.data?.type === 'sdocs:state-values' && e.source === iframe?.contentWindow) {
				onStateValues?.(e.data.values);
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
		src={resolvedSrc}
		title="Component preview"
		class="sdocs-iframe"
		scrolling={fullHeight ? 'auto' : 'no'}
		style:height={frameHeight}
	></iframe>
</div>

<style>
	.sdocs-preview-frame {
		overflow: hidden;
		background: var(--color-base-0);
	}
	.sdocs-preview-frame.full-height {
		flex: 1;
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
		max-height: none;
	}
</style>
