/** Discover all .sdoc files matching the include patterns */
export declare function discoverDocFiles(include: string[], root: string): Promise<string[]>;
/** Determine the sdoc kind from the file path */
export declare function getSdocKind(filePath: string): 'component' | 'page' | 'layout';
/** Get the absolute path for a relative import */
export declare function resolveImportPath(importPath: string, fromFile: string): string;
