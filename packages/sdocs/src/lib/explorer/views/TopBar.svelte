<script lang="ts">
	import type { SectionTree } from '../tree-builder.js';
	import type { AxisConfig } from '../../types.js';
	import { routeHref } from '../router.svelte.js';
	import { Icon } from '../../ui/Icon/index.js';

	type ThemeMode = 'light' | 'dark';

	interface Props {
		title: string;
		logo: string | false;
		sections: SectionTree[];
		activeSlug?: string;
		cssNames?: string[];
		activeStylesheet?: string;
		theme?: ThemeMode;
		/** Design-system dimensions to offer, one dropdown each. */
		axes?: Required<AxisConfig>[];
		/** Current pick per axis id. */
		axisValues?: Record<string, string>;
		/** This dev server serves the MCP endpoint — show the MCP button. */
		mcp?: boolean;
		/** Narrow viewport with somewhere to navigate: show the drawer toggle. */
		showBurger?: boolean;
		/** Whether the nav drawer is currently open. */
		navOpen?: boolean;
		onToggleNav?: () => void;
		/** The bar stays above the scrim, so its own links have to dismiss the
		 * drawer themselves or they'd load a page behind it. */
		onCloseNav?: () => void;
		onToggleFullscreen?: () => void;
		onStylesheetChange?: (name: string) => void;
		onThemeChange?: (theme: ThemeMode) => void;
		onAxisChange?: (id: string, value: string) => void;
	}

	let {
		title,
		logo,
		sections,
		activeSlug,
		cssNames = [],
		activeStylesheet,
		theme = 'light',
		axes = [],
		axisValues = {},
		mcp = false,
		showBurger = false,
		navOpen = false,
		onToggleNav,
		onCloseNav,
		onToggleFullscreen,
		onStylesheetChange,
		onThemeChange,
		onAxisChange,
	}: Props = $props();

	// ─── Axis controls: segmented while they fit, dropdowns when they don't ───

	/** The stylesheet picker is a switch like any other — one list of named
	 * variants, one active at a time — so it renders and collapses with the
	 * axes rather than keeping its own private control. Its id can't collide
	 * with an axis: `sdocs-` is reserved and axis ids can't start with `_`. */
	const STYLESHEET_CONTROL = '__stylesheet';

	const controls = $derived([
		...axes.map((axis) => ({
			id: axis.id,
			label: axis.label,
			values: axis.values,
			value: axisValues[axis.id] ?? axis.values[0],
			change: (v: string) => onAxisChange?.(axis.id, v),
		})),
		// One stylesheet is not a choice.
		...(cssNames.length > 1
			? [
					{
						id: STYLESHEET_CONTROL,
						label: 'Stylesheet',
						values: cssNames,
						value: activeStylesheet ?? cssNames[0],
						change: (v: string) => onStylesheetChange?.(v),
					},
				]
			: []),
	]);

	let barEl = $state<HTMLElement>();
	let sectionsEl = $state<HTMLElement>();
	/** Dropdowns instead of segmented controls. All axes switch together —
	 * a row where some are segmented and some aren't reads as a mistake. */
	let axesCompact = $state(false);
	/** The bar width at which the segmented controls last stopped fitting.
	 * Re-trying only above it is what keeps this from oscillating: expanding
	 * frees no space, so a plain "does it fit now?" would collapse, expand,
	 * collapse, forever. `collapsedAt` only ever grows, so it settles. */
	let collapsedAt = 0;
	/** Enough slack that re-expanding is worth a try, not a coin flip. */
	const RETRY_MARGIN = 48;

	function fitAxisControls() {
		if (!barEl || controls.length === 0) return;
		const width = barEl.clientWidth;
		// The tabs are the thing being crowded out, so they're the signal —
		// they scroll rather than wrap, so a clipped nav means the actions have
		// taken more than their share. The bar's own overflow covers the case
		// of a site with no sections at all.
		const crowded =
			(!!sectionsEl && sectionsEl.scrollWidth > sectionsEl.clientWidth + 1) ||
			barEl.scrollWidth > barEl.clientWidth + 1;
		if (!axesCompact) {
			if (crowded) {
				collapsedAt = width;
				axesCompact = true;
			}
		} else if (width > collapsedAt + RETRY_MARGIN) {
			axesCompact = false;
			// The observer won't fire again — the bar didn't resize, its
			// contents did — so check the wider controls ourselves once painted.
			requestAnimationFrame(fitAxisControls);
		}
	}

	$effect(() => {
		if (!barEl || controls.length === 0) return;
		void controls.length;
		const observer = new ResizeObserver(() => fitAxisControls());
		observer.observe(barEl);
		fitAxisControls();
		return () => observer.disconnect();
	});

	// Closing the drawer hands focus back to the control that opened it, so a
	// keyboard user isn't dropped at the top of the document.
	let burgerEl = $state<HTMLButtonElement>();
	let wasNavOpen = false;
	$effect(() => {
		if (navOpen) {
			wasNavOpen = true;
		} else if (wasNavOpen) {
			wasNavOpen = false;
			burgerEl?.focus();
		}
	});

	const themeIcons: Record<ThemeMode, string> = { light: '☀', dark: '☽' };
	const themeLabels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark' };

	// MCP info modal — endpoint resolved from the page, so it's right for any
	// host/port the dev server actually runs on.
	let mcpDialog: HTMLDialogElement | undefined = $state();
	let mcpUrl = $state('');
	let copied = $state('');
	const MCP_STDIO = 'npx sdocs mcp';
	const MCP_TOOLS = [
		['validate_sdoc', 'parse .sdoc text, return diagnostics and entities'],
		['scaffold_component_doc', 'a starter .sdoc from a component’s extracted props'],
		['get_authoring_guide', 'the full format reference (also at /llms.txt on the sdocs site)'],
		['list_docs', 'this project’s .sdoc files and the components they document'],
		['get_component_api', 'a component’s full extracted API'],
	];

	function openMcp() {
		mcpUrl = `${location.origin}/mcp`;
		copied = '';
		mcpDialog?.showModal();
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			setTimeout(() => (copied = ''), 1500);
		} catch {
			// Clipboard unavailable — the text is visible to select manually.
		}
	}
</script>

<header class="sdocs-topbar" bind:this={barEl}>
	{#if showBurger}
		<button
			bind:this={burgerEl}
			class="sdocs-burger"
			aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
			aria-expanded={navOpen}
			aria-controls="sdocs-nav"
			onclick={() => onToggleNav?.()}
		>
			<!-- Stays a burger while open: the drawer carries its own close,
			     and two X's a few pixels apart read as two different exits.
			     aria-expanded is what announces the state. -->
			<Icon name="menu" --w="20px" --h="20px" />
		</button>
	{/if}
	<a href={routeHref([])} class="sdocs-topbar-brand" onclick={() => onCloseNav?.()}>
		{#if logo === 'sdocs'}
			<Icon name="sdocs" --w="22px" --h="22px" --fill="#FC1D29" />
		{:else if logo}
			<img class="sdocs-topbar-logo" src={logo} alt="" />
		{/if}
		{title}
	</a>
	<nav class="sdocs-topbar-sections" bind:this={sectionsEl}>
		{#each sections as section (section.slug)}
			<a
				class="sdocs-topbar-tab"
				class:is-active={section.slug === activeSlug}
				aria-current={section.slug === activeSlug ? 'page' : undefined}
				href={routeHref(section.firstRoute ?? [section.slug])}
			>
				{section.title}
			</a>
		{/each}
	</nav>
	<div class="sdocs-topbar-actions">
		{#each controls as control (control.id)}
			<!-- The label is the accessible name rather than visible text: a few of
			     these is already most of the bar's free width, and the values
			     ("compact", "olive") mostly say which switch they belong to. -->
			{#if axesCompact}
				<select
					class="sdocs-axis-picker"
					aria-label={control.label}
					title={control.label}
					value={control.value}
					onchange={(e) => control.change(e.currentTarget.value)}
				>
					{#each control.values as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			{:else}
				<!-- Real radios: one name per control gives grouping, arrow-key
				     navigation and "only one at a time" for free, none of which a
				     row of buttons would have without writing it. -->
				<fieldset class="sdocs-axis-seg" title={control.label}>
					<legend class="sdocs-axis-seg-legend">{control.label}</legend>
					{#each control.values as value (value)}
						<label class="sdocs-axis-seg-item" class:is-active={control.value === value}>
							<input
								type="radio"
								name="sdocs-control-{control.id}"
								{value}
								checked={control.value === value}
								onchange={() => control.change(value)}
							/>
							{value}
						</label>
					{/each}
				</fieldset>
			{/if}
		{/each}
		{#if mcp}
			<button class="sdocs-topbar-btn sdocs-mcp-btn" onclick={openMcp} title="MCP server">
				MCP
			</button>
		{/if}
		<button class="sdocs-topbar-btn" onclick={() => onThemeChange?.(theme === 'light' ? 'dark' : 'light')} title="{themeLabels[theme]} theme">
			{themeIcons[theme]}
		</button>
		<button
			class="sdocs-topbar-btn sdocs-fullscreen-btn"
			onclick={() => onToggleFullscreen?.()}
			title="Fullscreen"
		>
			&#x26F6;
		</button>
		<!-- A real link: middle-click and open-in-new-tab work, and history
		     mode routes it client-side like any other internal anchor. -->
		<a
			class="sdocs-topbar-btn sdocs-about-btn"
			href={routeHref(['about'])}
			title="About"
			onclick={() => onCloseNav?.()}
		>
			&#9432;
		</a>
	</div>
</header>

{#if mcp}
	<dialog
		class="sdocs-mcp-dialog"
		bind:this={mcpDialog}
		onclick={(e) => e.target === mcpDialog && mcpDialog?.close()}
	>
		<div class="sdocs-mcp-body">
			<div class="sdocs-mcp-head">
				<h2>MCP server</h2>
				<button class="sdocs-topbar-btn" onclick={() => mcpDialog?.close()} title="Close">✕</button>
			</div>
			<p class="sdocs-mcp-lead">
				This dev server also serves the sdocs MCP server — authoring tools an
				agent can use to read this project's components and write valid
				<code>.sdoc</code> docs.
			</p>

			<div class="sdocs-mcp-row">
				<span class="sdocs-mcp-label">HTTP</span>
				<code>{mcpUrl}</code>
				<button class="sdocs-topbar-btn" onclick={() => copy(mcpUrl)}>
					{copied === mcpUrl ? 'Copied' : 'Copy'}
				</button>
			</div>
			<div class="sdocs-mcp-row">
				<span class="sdocs-mcp-label">stdio</span>
				<code>{MCP_STDIO}</code>
				<button class="sdocs-topbar-btn" onclick={() => copy(MCP_STDIO)}>
					{copied === MCP_STDIO ? 'Copied' : 'Copy'}
				</button>
			</div>

			<h3>Tools</h3>
			<ul class="sdocs-mcp-tools">
				{#each MCP_TOOLS as [name, blurb] (name)}
					<li><code>{name}</code> — {blurb}</li>
				{/each}
			</ul>

			<p class="sdocs-mcp-note">
				Turn this off with <code>mcp: false</code> in <code>sdocs.config.js</code>.
				Built sites never serve an MCP endpoint.
			</p>
		</div>
	</dialog>
{/if}

<style>
	.sdocs-topbar {
		/* Every control and button in the actions row is exactly this tall. */
		--sdocs-control-h: 24px;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 16px;
		height: var(--sdocs-topbar-h, 48px);
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-base-200);
		background: var(--color-base-0);
		font-family: var(--sans);
	}
	.sdocs-burger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		margin-left: -8px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--color-base-600);
		cursor: pointer;
	}
	.sdocs-burger:hover {
		background: var(--color-base-100);
		color: var(--color-base-900);
	}
	.sdocs-topbar-brand {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 18px;
		color: var(--color-base-900);
		text-decoration: none;
	}
	.sdocs-topbar-logo {
		width: 22px;
		height: 22px;
		object-fit: contain;
	}
	.sdocs-topbar-sections {
		display: flex;
		align-items: stretch;
		gap: 4px;
		height: 100%;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}
	.sdocs-topbar-tab {
		display: flex;
		align-items: center;
		padding: 0 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-base-500);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
	}
	.sdocs-topbar-tab:hover {
		color: var(--color-base-900);
	}
	.sdocs-topbar-tab.is-active {
		color: var(--color-action-500);
		border-bottom-color: var(--color-action-500);
	}
	.sdocs-topbar-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sdocs-axis-picker {
		box-sizing: border-box;
		height: var(--sdocs-control-h);
		font-size: 12px;
		padding: 0 4px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
	}
	/* Segmented control: a track holding one pill per value. Deliberately
	   smaller than the buttons beside it — it carries words, not glyphs, and
	   at button size three of them would dominate the bar. */
	.sdocs-axis-seg {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: var(--sdocs-control-h);
		/* A flex item's automatic minimum is its content, which silently wins
		   over `height` — the track rendered taller than the buttons beside it. */
		min-height: 0;
		gap: 1px;
		/* fieldset defaults would blow the flex line out and re-add spacing. */
		min-inline-size: 0;
		margin: 0;
		padding: 1px;
		border: 1px solid var(--color-base-200);
		border-radius: 5px;
		background: var(--color-base-100);
	}
	.sdocs-axis-seg-legend {
		/* The group's accessible name; the values alone don't say what they
		   vary. Hidden rather than absent — a floated legend would break the
		   track's box. */
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.sdocs-axis-seg-item {
		position: relative;
		display: inline-flex;
		align-items: center;
		align-self: stretch;
		padding: 0 7px;
		border-radius: 4px;
		font-size: 11px;
		line-height: 1;
		color: var(--color-base-500);
		white-space: nowrap;
		cursor: pointer;
	}
	.sdocs-axis-seg-item input {
		/* Invisible but still focusable, so the radio keeps its keyboard
		   behaviour — display:none would take it out of the tab order. */
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.sdocs-axis-seg-item:hover {
		color: var(--color-base-900);
	}
	.sdocs-axis-seg-item.is-active {
		background: var(--color-base-0);
		color: var(--color-base-900);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
	}
	.sdocs-axis-seg-item:has(input:focus-visible) {
		outline: 2px solid var(--color-action-500);
		outline-offset: 1px;
	}

	.sdocs-topbar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* The About "button" is an <a>, which is content-box by default —
		   without this it stood two pixels taller than the real buttons. */
		box-sizing: border-box;
		flex: none;
		height: var(--sdocs-control-h);
		min-width: var(--sdocs-control-h);
		padding: 0 6px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.sdocs-topbar-btn:hover {
		background: var(--color-base-100);
	}
	/* The About link wears the button's chrome. */
	.sdocs-about-btn {
		text-decoration: none;
	}
	.sdocs-mcp-btn {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	@media (max-width: 860px) {
		.sdocs-topbar {
			gap: 8px;
			padding: 0 12px;
		}
		/* The tabs move into the drawer, so the actions take the free space. */
		.sdocs-topbar-sections {
			display: none;
		}
		.sdocs-topbar-actions {
			margin-left: auto;
		}
		/* A long site name gives way rather than pushing the actions off. */
		.sdocs-topbar-brand {
			min-width: 0;
			font-size: 16px;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		/* The pickers move into the drawer: they're the controls here wide
		   enough to crowd out everything else. */
		.sdocs-axis-picker,
		.sdocs-axis-seg {
			display: none;
		}
		.sdocs-topbar-btn {
			/* A finger needs more than the desktop row's height. */
			height: 40px;
			min-width: 40px;
			border-color: transparent;
			font-size: 16px;
		}
		.sdocs-mcp-btn {
			font-size: 11px;
			border-color: var(--color-base-200);
		}
		/* Fullscreen hides chrome to free the stage — on a phone there is no
		   chrome worth the trade, and its exit is a hover-only hot corner.
		   After the .sdocs-topbar-btn block, which also sets `display`. */
		.sdocs-fullscreen-btn {
			display: none;
		}
	}

	/* MCP info modal */
	.sdocs-mcp-dialog {
		width: min(560px, calc(100vw - 48px));
		padding: 0;
		border: 1px solid var(--color-base-200);
		border-radius: 10px;
		background: var(--color-base-0);
		color: var(--color-base-800);
		font-family: var(--sans);
		font-size: 13px;
	}
	.sdocs-mcp-dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.sdocs-mcp-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px 24px;
	}
	.sdocs-mcp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sdocs-mcp-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--color-base-900);
	}
	.sdocs-mcp-lead {
		margin: 0;
		color: var(--color-base-600);
		line-height: 1.5;
	}
	.sdocs-mcp-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.sdocs-mcp-label {
		flex-shrink: 0;
		width: 40px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-base-400);
	}
	.sdocs-mcp-row code {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 5px 8px;
		border: 1px solid var(--color-base-150);
		border-radius: 6px;
		background: var(--color-base-50);
		font-size: 12px;
	}
	.sdocs-mcp-body h3 {
		margin: 6px 0 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-base-400);
	}
	.sdocs-mcp-tools {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--color-base-600);
	}
	.sdocs-mcp-tools code,
	.sdocs-mcp-lead code,
	.sdocs-mcp-note code {
		font-size: 12px;
		color: var(--color-base-800);
	}
	.sdocs-mcp-note {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--color-base-500);
	}
</style>
