import type { Plugin } from 'vite';
import type { SdocsOptions } from '../types.js';
interface AppPluginOptions {
    sdocsOptions?: SdocsOptions;
    /** Absolute path to user CSS file */
    cssPath?: string;
}
/**
 * Vite plugin that provides the virtual HTML shell and Svelte app entry
 * for standalone mode. Also handles SPA fallback routing.
 */
export declare function sdocsAppPlugin({ sdocsOptions, cssPath }?: AppPluginOptions): Plugin;
export {};
