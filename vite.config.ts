import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { sdocsPlugin } from './src/lib/vite.js';
import { loadConfig } from './src/lib/server/config.js';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig(async () => {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	// Generate .sdocs/ entry files (same as CLI does)
	const sdocsDir = resolve(cwd, '.sdocs');
	await mkdir(sdocsDir, { recursive: true });

	await writeFile(
		resolve(sdocsDir, 'index.html'),
		`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="icon" type="image/png" href="./favicon.png">
	<title>sdocs dev</title>
</head>
<body>
	<div id="app"></div>
	<script type="module" src="./entry.js"></script>
</body>
</html>`,
	);

	await writeFile(
		resolve(sdocsDir, 'entry.js'),
		`import { mount } from 'svelte';
import { docs, cssNames } from 'virtual:sdocs';
import App from '../src/lib/client/App.svelte';

mount(App, {
	target: document.getElementById('app'),
	props: {
		docs,
		cssNames,
		logo: ${JSON.stringify(config.logo)},
	}
});`,
	);

	await copyFile(
		resolve(cwd, 'src/lib/client/favicon.png'),
		resolve(sdocsDir, 'favicon.png'),
	);

	return {
		plugins: [svelte(), sdocsPlugin(config)],
		root: sdocsDir,
		server: {
			port: 3000,
			fs: { allow: ['..'] },
		},
	};
});
