<script lang="ts">
	const modules = import.meta.glob('./icons/*.svg', { eager: true, query: '?raw', import: 'default' });

	const icons: Record<string, string> = {};
	for (const [path, raw] of Object.entries(modules)) {
		const key = path.replace('./icons/', '').replace('.svg', '');
		icons[key] = raw as string;
	}

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
