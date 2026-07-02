import { sveltekit } from '@sveltejs/kit/vite';
import { sdocsPlugin } from 'sdocs/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		sdocsPlugin({
			include: ['./src/lib/**/*.sdoc'],
		})
	],
	server: {
		fs: {
			// Allow serving sdocs UI assets (fonts) from the workspace package.
			allow: ['../..']
		}
	}
});
