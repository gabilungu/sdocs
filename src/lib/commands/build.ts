import { resolve } from 'node:path';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadConfig } from '../server/config.js';
import { sdocsPlugin } from '../vite.js';
import { generateBuildFiles, cleanBuildFiles } from '../server/app-gen.js';

export async function buildCommand(): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	console.log('[sdocs] Building static site...');

	// Generate .sdocs/ with entry + preview HTML files
	const { sdocsDir, inputs } = await generateBuildFiles(config, cwd);
	const inputCount = Object.keys(inputs).length;
	console.log(`[sdocs] Generated ${inputCount} page(s) (1 main + ${inputCount - 1} previews)`);

	// Resolve include patterns to absolute paths
	const absoluteIncludes = config.include.map((p) => resolve(cwd, p));

	try {
		await build({
			configFile: false,
			root: sdocsDir,
			plugins: [
				svelte(),
				sdocsPlugin({ ...config, include: absoluteIncludes, _buildMode: true } as any),
			],
			build: {
				outDir: resolve(cwd, 'dist'),
				emptyOutDir: true,
				rollupOptions: {
					input: inputs,
				},
			},
		});

		console.log(`[sdocs] Build complete → dist/`);
	} finally {
		await cleanBuildFiles(cwd);
	}
}
