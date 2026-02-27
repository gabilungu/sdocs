import type { Plugin } from 'vite';
import type { SdocsConfig } from './types.js';
export declare function sdocsPlugin(userConfig?: SdocsConfig & {
    _buildMode?: boolean;
}): Plugin;
