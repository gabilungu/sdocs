import type { ResolvedSdocsConfig } from '../types.js';
/** Generate .sdocs/ directory with entry files for dev mode */
export declare function generateDevFiles(config: ResolvedSdocsConfig, cwd: string): Promise<string>;
/** Generate .sdocs/ directory with entry + preview HTML files for build mode */
export declare function generateBuildFiles(config: ResolvedSdocsConfig, cwd: string): Promise<{
    sdocsDir: string;
    inputs: Record<string, string>;
}>;
/** Remove the .sdocs/ temp directory */
export declare function cleanBuildFiles(cwd: string): Promise<void>;
