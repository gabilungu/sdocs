import type { SdocsConfig, ResolvedSdocsConfig } from '../types.js';
/** Find the config file path in the given directory */
export declare function findConfigFile(root: string): string | null;
/** Load and resolve the sdocs config with defaults */
export declare function loadConfig(root: string): Promise<ResolvedSdocsConfig>;
/** Merge user config with defaults */
export declare function resolveConfig(userConfig: SdocsConfig): ResolvedSdocsConfig;
