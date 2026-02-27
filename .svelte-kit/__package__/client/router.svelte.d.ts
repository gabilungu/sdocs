/** Hash-based router for sdocs. Uses #/Segment/Segment/... format. */
/** Get the current path segments */
export declare function getPath(): string[];
/** Navigate to a path */
export declare function navigate(segments: string[]): void;
/** Initialize the router — call once on app startup */
export declare function initRouter(): void;
/** Build a title path from meta.title (e.g. 'Demo / Button' → ['Demo', 'Button']) */
export declare function titleToPath(title: string): string[];
/** Build a hash string from a title path (for href attributes) */
export declare function pathToHash(segments: string[]): string;
