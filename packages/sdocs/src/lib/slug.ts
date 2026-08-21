/**
 * One slug rule, three callers.
 *
 * Route segments, heading anchors and entity addresses all turn a human title
 * into an identifier, and they used to do it three different ways. The entity
 * slugger was ASCII-only, so every title in a non-Latin script came out
 * 'untitled' — a Russian site had one addressable entity and a duplicate-
 * address error for the rest, while its routes were fine, because those went
 * through a different function.
 */

/**
 * Slug for one route segment — same rules as page heading anchors.
 *
 * Accented letters are FOLDED to their base (ă → a, ș → s, ł → l), not dropped:
 * filtering to ASCII first would turn "Verificări" into "verificri" and
 * "Setări" into "setri" — URLs that read like typos in every language that
 * isn't English. NFD splits a letter into base + combining mark, so removing
 * the marks leaves the base behind.
 *
 * Scripts with no ASCII base — Greek, Cyrillic, CJK, Arabic — keep their own
 * letters. They used to be stripped, which left every such title slugged
 * 'item': a site written in Russian had one reachable page and a route
 * collision for the rest. The router percent-encodes on the way out and
 * decodes on the way in, so `/кнопка` addresses the page it names.
 */
export function slugifySegment(text: string, fallback = 'item'): string {
	return (
		foldAccents(text)
			.toLowerCase()
			// Letters, numbers and the separators; punctuation and symbols go.
			.replace(/[^\p{L}\p{N}_\s-]/gu, '')
			.replace(/[\s_-]+/g, '-')
			// Trim after collapsing, so "  Weird -- Title!! " is weird-title
			// rather than -weird---title-.
			.replace(/^-+|-+$/g, '') || fallback
	);
}

/**
 * Decompose, then drop the combining marks — "ă" becomes "a".
 *
 * NFD only helps where the mark is a SEPARATE combining character. Letters whose
 * diacritic is part of the glyph have no canonical decomposition — a stroke is not a
 * combining mark — so ł, đ, ø and friends survive NFD untouched and would then be
 * filtered away. They get an explicit map; the list is the Latin-script letters a
 * European or Vietnamese title realistically contains.
 *
 * The fold applies only where it lands on the Latin alphabet. Outside it, a
 * combining mark is not an accent on a letter you already have: strip the
 * dakuten from ボ and you get ホ — "bo" becomes "ho", a different word.
 */
export function foldAccents(text: string): string {
	return [...text]
		.map((ch) => {
			const stroked = STROKED[ch];
			if (stroked) return stroked;
			const folded = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '');
			return /^[A-Za-z]+$/.test(folded) ? folded : ch;
		})
		.join('');
}

const STROKED: Record<string, string> = {
	ł: 'l', Ł: 'L',
	đ: 'd', Đ: 'D',
	ø: 'o', Ø: 'O',
	ß: 'ss',
	æ: 'ae', Æ: 'AE',
	œ: 'oe', Œ: 'OE',
	þ: 'th', Þ: 'TH',
	ð: 'd', Ð: 'D',
	ı: 'i',
	ŋ: 'n',
};
