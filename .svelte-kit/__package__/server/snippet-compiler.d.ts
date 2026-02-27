/** Base64url encode a string (URL-safe, no padding) */
export declare function base64urlEncode(str: string): string;
/** Base64url decode */
export declare function base64urlDecode(str: string): string;
/** Resolve relative imports to absolute paths for use in virtual components */
export declare function resolveImportsToAbsolute(imports: string[], docFilePath: string): string[];
/** Generate a virtual Svelte iframe wrapper component for a snippet.
 * Includes $state for reactive prop updates via postMessage. */
export declare function generateIframeComponent(absoluteImports: string[], snippetBody: string): string;
/** Generate the HTML page served inside the iframe */
export declare function generatePreviewHtml(iframeComponentId: string, css: string | Record<string, string> | null): string;
/** Build the virtual module ID for an iframe wrapper component */
export declare function iframeVirtualId(docFilePath: string, snippetName: string): string;
/** Build the preview URL for an iframe HTML page (dev mode) */
export declare function previewUrl(docFilePath: string, snippetName: string): string;
/** Build the preview URL for static build output */
export declare function buildPreviewUrl(docFilePath: string, snippetName: string): string;
/** Parse an iframe virtual ID back into its parts */
export declare function parseIframeId(id: string): {
    docFilePath: string;
    snippetName: string;
} | null;
/** Parse a preview URL back into its parts */
export declare function parsePreviewUrl(url: string): {
    docFilePath: string;
    snippetName: string;
} | null;
