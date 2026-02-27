/** Hash-based router for sdocs. Uses #/Segment/Segment/... format. */
/** Current hash path segments (reactive) */
let currentPath = $state([]);
/** Get the current path segments */
export function getPath() {
    return currentPath;
}
/** Navigate to a path */
export function navigate(segments) {
    const hash = segments.length > 0
        ? '#/' + segments.map(encodeSegment).join('/')
        : '#/';
    window.location.hash = hash;
}
/** Parse hash into path segments */
function parseHash() {
    const hash = window.location.hash;
    if (!hash || hash === '#' || hash === '#/')
        return [];
    const path = hash.startsWith('#/') ? hash.slice(2) : hash.slice(1);
    return path.split('/').filter(Boolean).map(decodeSegment);
}
/** Encode a segment: spaces → hyphens */
function encodeSegment(s) {
    return s.replace(/\s+/g, '-');
}
/** Decode a segment: hyphens → spaces */
function decodeSegment(s) {
    return s.replace(/-/g, ' ');
}
/** Initialize the router — call once on app startup */
export function initRouter() {
    currentPath = parseHash();
    window.addEventListener('hashchange', () => {
        currentPath = parseHash();
    });
}
/** Build a title path from meta.title (e.g. 'Demo / Button' → ['Demo', 'Button']) */
export function titleToPath(title) {
    return title.split('/').map((s) => s.trim()).filter(Boolean);
}
/** Build a hash string from a title path (for href attributes) */
export function pathToHash(segments) {
    return '#/' + segments.map(encodeSegment).join('/');
}
