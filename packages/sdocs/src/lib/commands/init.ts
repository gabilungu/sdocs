import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

	// Top-bar section order — sections come from @Section/ title prefixes
	// sections: ['Guides', 'Components'],

	// Sidebar configuration
	// sidebar: {
	// 	order: { root: ['Components', '*', 'Documentation'] },
	// 	open: ['Components'],
	// },
};
`;

export async function initCommand(): Promise<void> {
	const cwd = process.cwd();

	const existing = findConfigFile(cwd);
	if (existing) {
		console.log(`[sdocs] Config already exists: ${existing}`);
		return;
	}

	const configPath = resolve(cwd, 'sdocs.config.js');
	await writeFile(configPath, DEFAULT_CONFIG);
	console.log('[sdocs] Created sdocs.config.js');
}
