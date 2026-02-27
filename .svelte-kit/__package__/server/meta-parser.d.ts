import type { SdocMeta } from '../types.js';
interface MetaParseResult {
    meta: SdocMeta;
    componentPath: string | null;
    imports: string[];
}
/** Extract meta and imports from a .sdoc file */
export declare function parseDocFile(filePath: string): Promise<MetaParseResult>;
/** Parse meta from .sdoc source */
export declare function parseDocSource(source: string, filePath: string): MetaParseResult;
export {};
