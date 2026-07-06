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
				'welcome', 'overview', 'getting-started', 'features',
				'features/overview', 'features/prop-extraction', 'features/interactive-controls',
				'features/theming', 'features/sidebar', 'features/routing',
				'embedded-vite', 'configuration', 'types',
			],
		},
		{ slug: 'language', title: 'Language', order: ['overview', 'component-docs', 'page-docs', 'layout-docs'] },
		{ slug: 'cli', title: 'CLI', order: ['overview', 'commands'] },
		{ slug: 'extension', title: 'Extension', order: ['overview', 'language-support', 'projects-view', 'docs-tabs'] },
		{ slug: 'demo', title: 'Demo' },
	],

	home: 'explorer/welcome',
};
