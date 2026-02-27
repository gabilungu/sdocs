import type { TocHeading } from '../types.js';
/** Extract ToC headings from HTML markup (for .sdoc pages) */
export declare function extractTocFromHtml(body: string): TocHeading[];
