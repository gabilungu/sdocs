import type { Plugin } from 'vite';
import { type ComponentDocgen } from './docgen.js';
export interface SdocsPluginOptions {
    /**
     * Glob pattern(s) to find doc files.
     * @default '$lib/**\/*.docs.{svelte,svx}'
     */
    include?: string | string[];
}
/**
 * Vite plugin that extracts prop information from Svelte 5 components
 * and attaches it as __docgen metadata for runtime access.
 * Also extracts snippet source code from doc files.
 * Provides a virtual module for auto-loading doc files.
 */
export declare function sdocsPlugin(options?: SdocsPluginOptions): Plugin;
export type { ComponentDocgen };
export default sdocsPlugin;
