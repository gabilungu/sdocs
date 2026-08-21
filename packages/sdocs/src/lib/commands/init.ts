import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findConfigFile } from '../server/config.js';

const DEFAULT_CONFIG = `/** @type {import('sdocs').SdocsConfig} */
export default {
	// Glob pattern(s) to find sdoc files
	// include: ['./src/**/*.sdoc'],

	// Dev server port (default: 3000)
	// port: 3000,

	// Open browser on start (default: false)
	// open: false,

	// CSS loaded in preview iframes
	// css: './src/styles/global.css',
	// Or named stylesheets:
	// css: { light: './src/styles/light.css', dark: './src/styles/dark.css' },

	// Header title text (default: 'sdocs')
	// title: 'sdocs',

	// Header logo: 'sdocs' for the mascot, an image URL, or false to hide (default: 'sdocs')
	// logo: 'sdocs',

	// Design-system dimensions the reader can switch. Each gets a top-bar
	// control; the pick lands on every stage as data-<id>="<value>", which
	// your own css keys off: [data-density="compact"] { --space-md: 8px }
	// axes: [
	// 	{ id: 'scheme', label: 'Theme', values: ['light', 'dark'] },
	// 	{ id: 'density', label: 'Density', values: ['airy', 'compact'] },
	// ],

	// A continuous knob: a top-bar slider whose value lands on every stage as a
	// CSS custom property, for css that multiplies by it —
	// padding: calc(8px * var(--scale, 1))
	// scale: {
	// 	min: 0.75, max: 1.5, default: 1, step: 0.05,
	// 	presets: [{ label: 'S', value: 0.875 }, { label: 'M', value: 1 }],
	// },

	// The site's sections, in top-bar order. \`slug\` is the first route segment
	// and what titles reference as @slug/… ; \`order\` pins routes first in the
	// sidebar, everything else follows alphabetically.
	// sections: [
	// 	{ slug: 'guides', title: 'Guides', order: ['getting-started'] },
	// 	{ slug: 'components' },
	// ],

	// Route path of the landing page (must resolve to an entity)
	// home: 'guides/getting-started',
};
`;

/**
 * `sdocs.config.js` in an ES-module project, `sdocs.config.mjs` otherwise.
 *
 * The config is written with `export default`, and in a CommonJS project Node
 * reads a `.js` file as a script — so the file sdocs just scaffolded fails to
 * load with "Unexpected token 'export'", pointing at a file whose syntax is
 * fine. `.mjs` is read as a module whatever the package says.
 */
function configFileName(cwd: string): string {
	try {
		const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf-8'));
		if (pkg.type === 'module') return 'sdocs.config.js';
	} catch {
		// No package.json, or an unreadable one. Node treats a bare .js as
		// CommonJS, so .mjs is the safe answer here too.
	}
	return 'sdocs.config.mjs';
}

export async function initCommand(): Promise<void> {
	const cwd = process.cwd();

	const existing = findConfigFile(cwd);
	if (existing) {
		console.log(`[sdocs] Config already exists: ${existing}`);
		return;
	}

	const name = configFileName(cwd);
	await writeFile(resolve(cwd, name), DEFAULT_CONFIG);
	console.log(`[sdocs] Created ${name}`);
}
