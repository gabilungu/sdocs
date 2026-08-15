<script lang="ts">
	import { getContext, onMount, untrack } from 'svelte';
	import { navigateHref } from '../router.svelte.js';
	import { DEV } from 'esm-env';

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
		/** The stage this frame shows — names the iframe and carries the id an
		 * agent resolves back to this exact preview. */
		stage?: {
			stageId?: string;
			name?: string;
			role?: string;
			componentName?: string | null;
		} | null;
	}

	let { src, props = {}, cssVars = {}, activeStylesheet, fullHeight = false, onStateValues, onready, stage = null }: Props = $props();

	const stageKind = $derived(stage?.role === 'preview' ? 'component' : stage?.role);
	// "Button — Sizes preview": a showcase holds many frames, and an
	// accessibility tree (or an automation client) full of identical
	// "Component preview" labels can't tell them apart.
	const frameTitle = $derived(
		stage?.name
			? `${stage.componentName ? `${stage.componentName} — ` : ''}${stage.name} ${
					stage.role === 'example' ? 'example' : 'preview'
				}`
			: 'Component preview',
	);

	// Dev only: the id is a handle for the MCP server, which a built site never serves.
	// DEV comes from esm-env rather than Vite's own env object, so the packaged library
	// stays portable — bundlers fold it to false and the chip leaves no trace.
	// (svelte-package greps for that env expression as a literal string, comments
	// included, so naming it here would re-trigger the warning it is meant to prevent.)
	const showStageId = DEV;
	let copied = $state(false);
	function copyStageId() {
		if (!stage?.stageId) return;
		navigator.clipboard?.writeText(`sdocs:${stage.stageId}`).then(
			() => {
				copied = true;
				setTimeout(() => (copied = false), 1200);
			},
			() => {},
		);
	}

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

	// The reader's customization picks, from context rather than props: every
	// view that shows a stage would otherwise have to thread them through, and
	// they're one shared value for the whole app. A getter, so reassignment in
	// the Explorer stays visible here.
	const axisCtx = getContext('sdocs-axes') as { values: Record<string, string> } | undefined;
	const axisValues = $derived(axisCtx?.values ?? {});
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
				sendAxes();
				onready?.();
			}
			if (e.data?.type === 'sdocs:resize' && e.source === iframe?.contentWindow) {
				contentHeight = e.data.height;
			}
			if (e.data?.type === 'sdocs:state-values' && e.source === iframe?.contentWindow) {
				onStateValues?.(e.data.values);
			}
			// A link inside the stage that points at an app route — navigate the
			// host app; the iframe itself never leaves its stage page.
			if (e.data?.type === 'sdocs:navigate' && e.source === iframe?.contentWindow) {
				navigateHref(String(e.data.href));
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

	// A frame already on screen when the reader switches an axis. One that
	// mounts later reads the same values off the parent window as it boots,
	// so it never paints the defaults first (see PREVIEW_BOOTSTRAP_JS).
	function sendAxes() {
		if (ready && iframe?.contentWindow) {
			const data = $state.snapshot(axisValues);
			iframe.contentWindow.postMessage({ type: 'sdocs:update-axes', axes: data }, '*');
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

	$effect(() => {
		// Track axis changes
		JSON.stringify(axisValues);
		untrack(() => sendAxes());
	});
</script>

<div class="sdocs-preview-frame" class:full-height={fullHeight}>
	<iframe
		bind:this={iframe}
		src={resolvedSrc}
		title={frameTitle}
		class="sdocs-iframe"
		scrolling={fullHeight ? 'auto' : 'no'}
		style:height={frameHeight}
		data-sdocs-stage-id={stage?.stageId}
		data-sdocs-stage-kind={stageKind}
	></iframe>
	{#if showStageId && stage?.stageId}
		<!-- The handle you say out loud. Quiet until you go looking for it:
		     every stage wearing a visible code all the time is noise for the
		     humans reading the docs, and the id is only ever wanted for one
		     stage at a time — the one under the cursor. -->
		<button
			type="button"
			class="sdocs-stage-id"
			title="Copy this stage's id — an agent can resolve it to this exact preview"
			onclick={copyStageId}
		>
			{copied ? 'copied' : `sdocs:${stage.stageId}`}
		</button>
	{/if}
</div>

<style>
	.sdocs-preview-frame {
		position: relative;
		overflow: hidden;
		background: var(--color-base-0);
	}
	.sdocs-stage-id {
		position: absolute;
		right: 4px;
		bottom: 4px;
		padding: 1px 5px;
		border: none;
		border-radius: 4px;
		background: var(--color-base-100);
		color: var(--color-base-400);
		font-family: var(--mono, ui-monospace, monospace);
		font-size: 10px;
		line-height: 1.5;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.12s ease;
	}
	.sdocs-preview-frame:hover .sdocs-stage-id,
	.sdocs-stage-id:focus-visible {
		opacity: 1;
	}
	.sdocs-stage-id:hover {
		color: var(--color-base-600);
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
