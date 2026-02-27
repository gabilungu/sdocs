import type { TocHeading } from '../types.js';

/** Slugify a heading text into an ID */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();
}

/** Extract ToC headings from HTML markup (for .sdoc pages) */
export function extractTocFromHtml(body: string): TocHeading[] {
	const headings: TocHeading[] = [];
	const regex = /<h([2-4])[^>]*>([\s\S]*?)<\/h[2-4]>/gi;
	let match;

	while ((match = regex.exec(body)) !== null) {
		const level = parseInt(match[1]);
		const text = match[2].replace(/<[^>]*>/g, '').trim();
		if (text) {
			headings.push({ text, level, id: slugify(text) });
		}
	}

	return headings;
}
