import { scanSdoc } from 'sdocs/language';

/**
 * Which block opener an offset sits in, decided by the scanner rather than by
 * looking at one line.
 *
 * Attribute completion used to test `/^\s*\[(SHOWCASE|DOC|…)\b/` against the
 * cursor's line, so inside a wrapped opener — where the cursor's line is
 * `\ttitle="…"` or a bare `]` — it matched nothing and the provider returned
 * before it ever consulted the rules. That layout is not exotic: the
 * extension's own formatter writes it for every opener wider than the print
 * width, so completion stopped working on exactly the openers long enough to
 * need it.
 *
 * The scanner already reads the wrapped form correctly: `openerSpan` covers
 * every line of it and `attrs` collects the attributes across all of them.
 */
export interface OpenerContext {
	/** The tag as written — 'SHOWCASE', 'COMPONENT', 'component', 'example'. */
	kind: string;
	/** Attribute names already written anywhere in this opener. */
	present: Set<string>;
}

interface Candidate {
	kind: string;
	attrs: Record<string, { span: { start: number; end: number } }>;
	openerSpan: { start: number; end: number };
}

/** Entities and their sub-blocks, innermost last so a block wins over its host. */
function candidates(text: string): Candidate[] {
	const file = scanSdoc(text);
	const out: Candidate[] = [];
	for (const entity of file.entities) {
		out.push({
			kind: entity.kind,
			attrs: entity.attrs as Candidate['attrs'],
			openerSpan: entity.openerSpan,
		});
		for (const block of entity.blocks ?? []) {
			out.push({
				// The tag as authored, so `component`/`example` and their
				// uppercase spellings both reach attributeRules().
				kind: block.tag,
				attrs: block.attrs as Candidate['attrs'],
				openerSpan: block.openerSpan,
			});
		}
	}
	return out;
}

/**
 * The opener the offset is inside, or null.
 *
 * Null when the offset has not passed the tag name yet (there is nothing to
 * complete on `[SHOW|`), when it is past the closing `]`, or when it sits
 * inside an attribute value — which is the check that replaces the old
 * count-the-quotes-on-this-line guard, and the reason a multi-line
 * `args={{ … }}` no longer confuses it.
 */
export function openerAt(text: string, offset: number): OpenerContext | null {
	let best: Candidate | null = null;
	for (const c of candidates(text)) {
		const afterTag = c.openerSpan.start + 1 + c.kind.length;
		if (offset <= afterTag) continue;
		if (offset > c.openerSpan.end - 1) continue;
		// Innermost wins: a sub-block opener sits inside its entity's span.
		if (!best || c.openerSpan.start >= best.openerSpan.start) best = c;
	}
	if (!best) return null;
	for (const attr of Object.values(best.attrs)) {
		if (attr && offset > attr.span.start && offset < attr.span.end) return null;
	}
	return {
		kind: best.kind,
		present: new Set(Object.keys(best.attrs)),
	};
}

/** The entity whose body the offset sits in — what the bare-`[` branch needs. */
export function hostEntityAt(text: string, offset: number): string | null {
	const file = scanSdoc(text);
	const host = file.entities.find((e) => offset > e.openerSpan.end && offset < e.span.end);
	return host ? host.kind : null;
}
