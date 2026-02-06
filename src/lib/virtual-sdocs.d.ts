/**
 * Type declarations for the virtual:sdocs module.
 *
 * To use in your project, add to your tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "types": ["sdocs/virtual"]
 *   }
 * }
 *
 * Or reference directly in a .d.ts file:
 * /// <reference types="sdocs/virtual" />
 */
declare module 'virtual:sdocs' {
	/**
	 * Doc modules loaded via import.meta.glob by the sdocs vite plugin.
	 * Contains all .docs.svelte and .docs.svx files matching the configured pattern.
	 */
	export const docs: Record<string, unknown>;
}
