import type { ExtractedSnippet } from '../types.js';
/** Extract top-level {#snippet} blocks from .sdoc source, handling nested snippets */
export declare function extractSnippets(source: string): ExtractedSnippet[];
/** Check if a Default snippet exists or needs auto-generation */
export declare function hasDefaultSnippet(snippets: ExtractedSnippet[]): boolean;
/** Generate an auto-generated Default snippet body */
export declare function generateAutoDefault(componentName: string): string;
/** Extract the markup body of a .sdoc file (everything outside <script> and <style>) */
export declare function extractMarkupBody(source: string): string;
/** Get the snippet names in order (Default first, then alphabetical) */
export declare function getSnippetOrder(snippets: ExtractedSnippet[]): string[];
