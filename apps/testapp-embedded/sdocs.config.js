/** @type {import('sdocs').SdocsConfig} */
export default {
	include: ['./src/lib/**/*.sdoc'],
	css: './src/app.css',
	scale: {
		min: 0.75, max: 1.5, default: 1, step: 0.05,
		presets: [
			{ label: 'S', value: 0.875 },
			{ label: 'M', value: 1 },
			{ label: 'L', value: 1.25 },
		],
	},
	axes: [
		{ id: 'scheme', label: 'Theme', values: ['light', 'dark'] },
		{ id: 'shape', label: 'Shape', values: ['rounded', 'sharp', 'pill'] },
	],
};
