import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { sdocsPlugin } from './src/lib/vite-plugin.js';

export default defineConfig({
	plugins: [
		sveltekit(),
		sdocsPlugin({
			include: [
				'/src/routes/demo/**/*.docs.{svelte,svx}',
				'$lib/ui/**/*.docs.{svelte,svx}',
			],
		}),
	],
	server: {
		port: 5173,
	},
	ssr: {
		noExternal: ['lucide-svelte'],
	},
});
