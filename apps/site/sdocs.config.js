/** @type {import('sdocs').SdocsConfig} */
export default {
	include: ['./src/lib/ui/**/*.sdoc'],

	// Loaded into preview iframes; must be self-contained (see src/preview.css)
	css: './src/preview.css',
};
