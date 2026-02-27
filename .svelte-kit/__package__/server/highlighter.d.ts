/** Highlight source code and return HTML */
export declare function highlight(code: string, lang?: string): Promise<string>;
/** Dispose the highlighter (for cleanup) */
export declare function disposeHighlighter(): Promise<void>;
