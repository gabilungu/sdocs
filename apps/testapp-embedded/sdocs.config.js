/** @type {import('sdocs').SdocsConfig} */
export default {
	include: ['./src/lib/**/*.sdoc'],
	css: './src/app.css',
	axes: [
		{ id: 'scheme', label: 'Theme', values: ['light', 'dark'] },
		{ id: 'shape', label: 'Shape', values: ['rounded', 'sharp', 'pill'] },
	],
};
