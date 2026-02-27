import type { ComponentData } from '../types.js';
/** Parse all component data from a Svelte component file */
export declare function parseComponent(filePath: string): Promise<ComponentData>;
/** Parse component data from source */
export declare function parseComponentSource(source: string): ComponentData;
