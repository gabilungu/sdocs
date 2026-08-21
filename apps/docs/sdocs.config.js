/** @type {import('sdocs').SdocsConfig} */
export default {
	include: ['./src/**/*.sdoc'],
	port: 3100,

	title: 'sdocs',
	favicon: '/favicon.svg',
	static: './static',


	sections: [
		{
			slug: 'explorer',
			title: 'Explorer',
			order: [
				'overview', 'getting-started', 'features',
				'features/overview', 'features/prop-extraction', 'features/interactive-controls',
				'features/theming', 'features/sidebar', 'features/mobile', 'features/routing',
				'embedded-vite', 'configuration', 'types',
			],
		},
		{
			slug: 'language',
			title: 'Language',
			order: ['overview', 'component-docs', 'doc-pages', 'svelte-pages', 'layout-docs'],
		},
		{ slug: 'cli', title: 'CLI', order: ['overview', 'commands'] },
		{ slug: 'extension', title: 'Extension', order: ['overview', 'language-support', 'projects-view', 'docs-tabs'] },
		{
			slug: 'features',
			title: 'Features',
			order: ['whats-new', 'block-script-style', 'stage-backgrounds', 'api-extraction'],
		},
		// The demo section showcases this site's own components rather than
		// documenting sdocs — the rule sets it apart from the product docs.
		{ type: 'divider' },
		{ slug: 'demo', title: 'Demo' },
	],

	// The landing page: a sectionless [PAGE] routed at the site root.
	home: 'welcome',
};
