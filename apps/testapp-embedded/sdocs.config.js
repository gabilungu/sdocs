/** @type {import('sdocs').SdocsConfig} */
export default {
	include: ['./src/lib/**/*.sdoc'],
	css: './src/app.css',
	scale: { min: 0.75, max: 1.5, default: 1, step: 0.05 },
	axes: [
		{ id: 'scheme', label: 'Theme', values: ['light', 'dark'] },
		{ id: 'shape', label: 'Shape', values: ['rounded', 'sharp', 'pill'] },
	],
};
