import type { SdocsOptions } from '../types.js';
export interface SdocsConfig {
    /** Glob pattern(s) to find doc files */
    include?: string | string[];
    /** Dev server port */
    port?: number;
    /** Open browser on start */
    open?: boolean;
    /** Path to a CSS file to load in component previews (relative to project root) */
    css?: string;
    /** Sdocs UI options (sidebar order, etc.) */
    options?: SdocsOptions;
}
export declare function loadConfig(cwd?: any): Promise<Required<SdocsConfig>>;
