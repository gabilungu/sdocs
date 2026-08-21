<script lang="ts">
	import type { SectionTree } from '../tree-builder.js';
	import type { AxisConfig, ScaleConfig } from '../../types.js';
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
		/** The scale slider's range, or null when the project declares none. */
		scale?: Required<ScaleConfig> | null;
		scaleValue?: number;
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
		onScaleChange?: (value: number) => void;
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
		scale = null,
		scaleValue = 1,
		mcp = false,
		showBurger = false,
		navOpen = false,
		onToggleNav,
		onCloseNav,
		onToggleFullscreen,
		onStylesheetChange,
		onThemeChange,
		onAxisChange,
		onScaleChange,
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

	/** What the fit pass has to work with. The scale counts: it gives up its
	 * label at the same width the switches give up their names, so a bar
	 * carrying only a scale still needs measuring. */
	const hasFittedControls = $derived(controls.length > 0 || !!scale);

	function fitAxisControls() {
		if (!barEl || !hasFittedControls) return;
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
		if (!barEl || !hasFittedControls) return;
		void controls.length;
		void scale;
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
	/** Every tool the server serves. It listed five of fourteen, which
	 * under-sold the thing to the one audience most able to use it. */
	const MCP_TOOLS = [
		['validate_sdoc', 'parse .sdoc text, return diagnostics and entities'],
		['get_authoring_guide', 'the format reference, whole or one section'],
		['get_changelog', 'this install’s changelog, breaking changes first'],
		['list_docs', 'the project’s docs, routes, notes, todos, glossary and statuses'],
		['search_docs', 'find a page by any name it goes under, or sweep by note type'],
		['check_docs', 'compile every stage and report what breaks'],
		['check_coverage', 'which components have a [COMPONENT] preview'],
		['resolve_visual_target', 'a stage’s preview-only route, for screenshots'],
		['get_component_api', 'a component’s full extracted API and description'],
		['scaffold_component_doc', 'a starter .sdoc from a component’s extracted props'],
		['set_notes', 'replace a [NOTES] block — writes to your source'],
		['set_status', 'set a [COMPONENT]’s lifecycle status — writes to your source'],
		['set_todos', 'replace a [TODO] checklist — writes to your source'],
		['toggle_todo', 'tick one todo item — writes to your source'],
	];

	/** The kebab: About, and MCP when the config leaves it on. Closing on an
	 * outside pointerdown rather than a click, so the menu is gone before
	 * whatever was clicked reacts. */
	let menuOpen = $state(false);
	let menuEl: HTMLElement | undefined = $state();
	let menuButton: HTMLElement | undefined = $state();

	$effect(() => {
		if (!menuOpen) return;
		const close = (e: Event) => {
			const target = e.target as Node;
			if (menuEl?.contains(target) || menuButton?.contains(target)) return;
			menuOpen = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			menuOpen = false;
			menuButton?.focus();
		};
		document.addEventListener('pointerdown', close, true);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', close, true);
			document.removeEventListener('keydown', onKey);
		};
	});

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
		{#each sections as section, i (section.slug)}
			<a
				class="sdocs-topbar-tab"
				class:is-active={section.slug === activeSlug}
				aria-current={section.slug === activeSlug ? 'page' : undefined}
				href={routeHref(section.firstRoute ?? [section.slug])}
			>
				{section.title}
			</a>
			<!-- Only between tabs: a rule with nothing after it separates the
			     last group from the empty rest of the bar. -->
			{#if section.dividerAfter && i < sections.length - 1}
				<span class="sdocs-topbar-divider" role="separator" aria-orientation="vertical"></span>
			{/if}
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
		{#if scale}
			<!-- A range, not a set of names, so it stays a slider at every width:
			     there is no dropdown form of "anything between 0.75 and 1.5", and
			     it is already narrower than a segmented control. -->
			<!-- Everything around the slider resets it. Those are real buttons
			     rather than a click handler on the surround: a reset the pointer
			     can reach and the keyboard can't is half a control. The label
			     goes when the switches give up their names — by then the bar
			     needs the room more than the reader needs the word. -->
			<div class="sdocs-scale" title="{scale.label} — sets {scale.var} on every stage">
				{#if !axesCompact}
					<button
						type="button"
						class="sdocs-scale-reset"
						title="Reset {scale.label}"
						onclick={() => onScaleChange?.(scale.default)}
					>
						{scale.label}
					</button>
				{/if}
				<input
					type="range"
					aria-label={scale.label}
					min={scale.min}
					max={scale.max}
					step={scale.step}
					value={scaleValue}
					oninput={(e) => onScaleChange?.(e.currentTarget.valueAsNumber)}
					ondblclick={() => onScaleChange?.(scale.default)}
				/>
				<button
					type="button"
					class="sdocs-scale-reset sdocs-scale-value"
					title="Reset {scale.label}"
					onclick={() => onScaleChange?.(scale.default)}
				>
					{scaleValue}
				</button>
				{#if scale.presets.length}
					<!-- Named stops for the same knob, so they live with it rather
					     than in a control of their own: the slider reaches
					     everything between them. No border of their own — the
					     group around them already draws one. -->
					<fieldset class="sdocs-scale-presets" title="{scale.label} presets">
						<legend class="sdocs-axis-seg-legend">{scale.label} presets</legend>
						{#each scale.presets as preset (preset.label)}
							{@const active = Math.abs(scaleValue - preset.value) < scale.step / 2}
							<label class="sdocs-axis-seg-item" class:is-active={active}>
								<input
									type="radio"
									name="sdocs-scale-preset"
									value={preset.value}
									checked={active}
									onchange={() => onScaleChange?.(preset.value)}
								/>
								{preset.label}
							</label>
						{/each}
					</fieldset>
				{/if}
			</div>
		{/if}
		<!-- Theme and fullscreen stay as buttons: they get used. About and MCP
		     are read-once actions, and the two slots they were spending are
		     what crowds the section tabs into their compact mode. -->
		<button
			class="sdocs-topbar-btn"
			onclick={() => onThemeChange?.(theme === 'light' ? 'dark' : 'light')}
			title="{themeLabels[theme]} theme"
			aria-label="Switch to the {themeLabels[theme].toLowerCase()} theme"
		>
			<span aria-hidden="true">{themeIcons[theme]}</span>
		</button>
		<button
			class="sdocs-topbar-btn sdocs-fullscreen-btn"
			onclick={() => onToggleFullscreen?.()}
			title="Fullscreen"
			aria-label="Enter fullscreen"
		>
			<span aria-hidden="true">&#x26F6;</span>
		</button>
		<div class="sdocs-menu-wrap">
			<button
				bind:this={menuButton}
				class="sdocs-topbar-btn sdocs-menu-btn"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				title="More"
				aria-label="More — about sdocs, changelog"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span aria-hidden="true">&#8942;</span>
			</button>
			{#if menuOpen}
				<div class="sdocs-menu" role="menu" bind:this={menuEl}>
					<!-- A real link: middle-click and open-in-new-tab work, and
					     history mode routes it client-side like any other
					     internal anchor. -->
					<a
						class="sdocs-menu-item"
						role="menuitem"
						href={routeHref(['about'])}
						onclick={() => {
							menuOpen = false;
							onCloseNav?.();
						}}
					>
						About sdocs
					</a>
					<a
						class="sdocs-menu-item"
						role="menuitem"
						href={routeHref(['changelog'])}
						onclick={() => {
							menuOpen = false;
							onCloseNav?.();
						}}
					>
						What's changed
					</a>
					{#if mcp}
						<button
							class="sdocs-menu-item"
							role="menuitem"
							onclick={() => {
								menuOpen = false;
								openMcp();
							}}
						>
							MCP server
						</button>
					{/if}
				</div>
			{/if}
		</div>
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
				<button
					class="sdocs-topbar-btn"
					onclick={() => mcpDialog?.close()}
					title="Close"
					aria-label="Close"
				>
					<span aria-hidden="true">✕</span>
				</button>
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
	.sdocs-topbar-divider {
		flex: none;
		align-self: center;
		width: 1px;
		/* Short of the bar's full height: a rule that reaches the edges reads
		   as structure, and this only groups the tabs. */
		height: 18px;
		margin: 0 8px;
		background: var(--color-base-200);
	}
	.sdocs-topbar-tab {
		display: flex;
		align-items: center;
		padding: 0 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-base-600);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
	}
	.sdocs-topbar-tab:hover {
		color: var(--color-base-900);
	}
	.sdocs-topbar-tab.is-active {
		/* The label is text at 4.5:1; the underline beneath it is not, and keeps
		   the accent it was drawn in — 3:1 is the bar a non-text indicator has
		   to clear, and it does. */
		color: var(--color-action-600);
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
	/* The presets inside the scale group: the same items as a segmented
	   control, without the chrome — one bordered box inside another reads as
	   two controls when it is one. */
	.sdocs-scale-presets {
		display: inline-flex;
		align-items: center;
		align-self: stretch;
		box-sizing: border-box;
		gap: 1px;
		min-inline-size: 0;
		/* Set off from the readout without a rule; the group's own padding
		   already separates it from the edge. */
		margin: 0 -3px 0 3px;
		padding: 0;
		border: 0;
		border-left: 1px solid var(--color-base-200);
		padding-left: 4px;
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

	/* Sized to the row, and no wider than it needs: the bar's free width is
	   already spoken for by the segmented controls. */
	.sdocs-scale {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: var(--sdocs-control-h);
		min-height: 0;
		gap: 6px;
		padding: 0 7px;
		border: 1px solid var(--color-base-200);
		border-radius: 5px;
		background: var(--color-base-100);
		font-size: 11px;
		line-height: 1;
		color: var(--color-base-500);
		cursor: pointer;
	}
	.sdocs-scale:hover {
		color: var(--color-base-900);
	}
	/* The label and the readout are buttons only so they can be clicked and
	   tabbed to; they carry none of a button's chrome. */
	.sdocs-scale-reset {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		white-space: nowrap;
		cursor: pointer;
	}
	.sdocs-scale-reset:focus-visible {
		outline: 2px solid var(--color-action-500);
		outline-offset: 2px;
		border-radius: 2px;
	}
	.sdocs-scale input {
		width: 72px;
		height: 2px;
		margin: 0;
		accent-color: var(--color-action-500);
		cursor: pointer;
	}
	.sdocs-scale-value {
		/* Fixed width so the row doesn't shuffle as the number changes. */
		width: 2.4em;
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--color-base-900);
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
	/* ── Kebab menu ── */
	.sdocs-menu-wrap {
		position: relative;
		display: flex;
	}

	.sdocs-menu-btn {
		/* The glyph is a thin column of dots; without extra tracking it reads
		   as a speck rather than a control. */
		font-size: 17px;
		line-height: 1;
	}

	.sdocs-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		min-width: 150px;
		padding: 4px;
		border: 1px solid var(--color-base-200);
		border-radius: 8px;
		background: var(--color-base-0);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
	}

	.sdocs-menu-item {
		display: block;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: 5px;
		background: none;
		font: inherit;
		font-size: 13px;
		color: var(--color-base-800);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.sdocs-menu-item:hover {
		background: var(--color-base-100);
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
		.sdocs-axis-seg,
		.sdocs-scale {
			display: none;
		}
		.sdocs-topbar-btn {
			/* A finger needs more than the desktop row's height. */
			height: 40px;
			min-width: 40px;
			border-color: transparent;
			font-size: 16px;
		}
		.sdocs-menu-item {
			/* Menu rows are thumb targets on a phone, like the bar's buttons. */
			padding: 11px 12px;
			font-size: 14px;
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
