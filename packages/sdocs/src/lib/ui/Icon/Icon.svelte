<script lang="ts">
	// Font Awesome Free (CC BY 4.0) — the two semantic sets, [COMPONENT] status
	// and [NOTES] types. Filled, where the chrome icons below are Lucide
	// strokes: a status glyph is content, and reads better solid at 13px.
	import faPencilSvg from './icons/fa/pencil.svg?raw';
	import faScrewdriverWrenchSvg from './icons/fa/screwdriver-wrench.svg?raw';
	import faEyeSvg from './icons/fa/eye.svg?raw';
	import faMagnifyingGlassSvg from './icons/fa/magnifying-glass.svg?raw';
	import faFlaskSvg from './icons/fa/flask.svg?raw';
	import faBanSvg from './icons/fa/ban.svg?raw';
	import faCircleCheckSvg from './icons/fa/circle-check.svg?raw';
	import faBugSvg from './icons/fa/bug.svg?raw';
	import faUniversalAccessSvg from './icons/fa/universal-access.svg?raw';
	import faTriangleExclamationSvg from './icons/fa/triangle-exclamation.svg?raw';
	import faGaugeHighSvg from './icons/fa/gauge-high.svg?raw';
	import faLightbulbSvg from './icons/fa/lightbulb.svg?raw';
	import faCircleInfoSvg from './icons/fa/circle-info.svg?raw';

	import bookmarkSvg from './icons/bookmark.svg?raw';
	import chevronDownSvg from './icons/chevron-down.svg?raw';
	import circleAlertSvg from './icons/circle-alert.svg?raw';
	import circleCheckSvg from './icons/circle-check.svg?raw';
	import chevronLeftSvg from './icons/chevron-left.svg?raw';
	import chevronRightSvg from './icons/chevron-right.svg?raw';
	import chevronUpSvg from './icons/chevron-up.svg?raw';
	import codeSvg from './icons/code.svg?raw';
	import componentSvg from './icons/component.svg?raw';
	import copySvg from './icons/copy.svg?raw';
	import databaseSvg from './icons/database.svg?raw';
	import diamondSvg from './icons/diamond.svg?raw';
	import externalLinkSvg from './icons/external-link.svg?raw';
	import fileCodeSvg from './icons/file-code.svg?raw';
	import infoSvg from './icons/info.svg?raw';
	import fileTextSvg from './icons/file-text.svg?raw';
	import folderOpenSvg from './icons/folder-open.svg?raw';
	import folderSvg from './icons/folder.svg?raw';
	import menuSvg from './icons/menu.svg?raw';
	import paletteSvg from './icons/palette.svg?raw';
	import panelsTopLeftSvg from './icons/panels-top-left.svg?raw';
	import blocksSvg from './icons/blocks.svg?raw';
	import sdocsSvg from './icons/sdocs.svg?raw';
	import slidersHorizontalSvg from './icons/sliders-horizontal.svg?raw';
	import squareFunctionSvg from './icons/square-function.svg?raw';
	import stickyNoteSvg from './icons/sticky-note.svg?raw';
	import triangleAlertSvg from './icons/triangle-alert.svg?raw';
	import xSvg from './icons/x.svg?raw';
	import zapSvg from './icons/zap.svg?raw';

	const icons: Record<string, string> = {
		'fa-pencil': faPencilSvg,
		'fa-screwdriver-wrench': faScrewdriverWrenchSvg,
		'fa-eye': faEyeSvg,
		'fa-magnifying-glass': faMagnifyingGlassSvg,
		'fa-flask': faFlaskSvg,
		'fa-ban': faBanSvg,
		'fa-circle-check': faCircleCheckSvg,
		'fa-bug': faBugSvg,
		'fa-universal-access': faUniversalAccessSvg,
		'fa-triangle-exclamation': faTriangleExclamationSvg,
		'fa-gauge-high': faGaugeHighSvg,
		'fa-lightbulb': faLightbulbSvg,
		'fa-circle-info': faCircleInfoSvg,
		'bookmark': bookmarkSvg,
		'chevron-down': chevronDownSvg,
		'circle-alert': circleAlertSvg,
		'circle-check': circleCheckSvg,
		'chevron-left': chevronLeftSvg,
		'chevron-right': chevronRightSvg,
		'chevron-up': chevronUpSvg,
		'code': codeSvg,
		'component': componentSvg,
		'copy': copySvg,
		'database': databaseSvg,
		'diamond': diamondSvg,
		'external-link': externalLinkSvg,
		'file-code': fileCodeSvg,
		'info': infoSvg,
		'file-text': fileTextSvg,
		'folder-open': folderOpenSvg,
		'folder': folderSvg,
		'menu': menuSvg,
		'palette': paletteSvg,
		'panels-top-left': panelsTopLeftSvg,
		'blocks': blocksSvg,
		'sdocs': sdocsSvg,
		'sliders-horizontal': slidersHorizontalSvg,
		'square-function': squareFunctionSvg,
		'sticky-note': stickyNoteSvg,
		'triangle-alert': triangleAlertSvg,
		'x': xSvg,
		'zap': zapSvg,
	};

	/**
	 * @cssvar {length} --w - Icon width (default: 24px)
	 * @cssvar {length} --h - Icon height (default: 24px)
	 * @cssvar {color} --fill - Icon color, inherited via currentColor (default: currentColor)
	 */
	interface Props {
		/** Icon name matching a filename in the icons folder (e.g. "chevron-right") */
		name: string;
		/** Additional CSS class names */
		class?: string;
	}

	let { name, class: className = '' }: Props = $props();

	const svg = $derived(icons[name] ?? '');

	export { icons };
</script>

<span class="Icon {className}" aria-hidden="true">
	{@html svg}
</span>

<style>
	.Icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--w, 24px);
		height: var(--h, 24px);
		color: var(--fill, currentColor);
		line-height: 0;
	}
	.Icon :global(svg) {
		width: 100%;
		height: 100%;
	}
</style>
