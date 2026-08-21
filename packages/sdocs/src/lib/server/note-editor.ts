/**
 * Rewriting an opener's `notes` attribute in `.sdoc` source.
 *
 * The dev server lets a reader add and edit notes from the Explorer, which
 * means editing the file they are reading. The edit is deliberately the
 * smallest one that can be made: the attribute's own span is replaced and
 * nothing else in the file is re-serialized, so a document keeps its
 * formatting, its comments, and every byte the author put there.
 *
 * Kept apart from the middleware that calls it so the interesting half — find
 * the opener, splice the attribute — is a pure function of source text.
 */

import { scanSdoc, type Attrs, type Entity, type SubBlock } from '../language/scanner.js';
import { slugifyTitle } from '../language/parser.js';
import type { DocNote } from '../types.js';

export interface NoteTarget {
	/** Slug of the entity to edit, as the Explorer knows it. */
	entitySlug: string;
	/** Title of an `[example]` inside that entity, to edit its notes instead
	 * of the entity's own. */
	exampleTitle?: string | null;
}

export class NoteTargetError extends Error {}

/**
 * A `[NOTES]` block, or '' when there is nothing to write.
 *
 * `base` is the indentation the block sits at — one level inside its entity or
 * example. A note's text is written verbatim on one line: the block's grammar
 * is one note per line, so a newline inside a note would split it in two.
 */
export function serializeNotes(notes: DocNote[], base: string): string {
	if (notes.length === 0) return '';
	const lines = notes.map((n) => {
		const text = n.note.replace(/\r?\n/g, ' ').trim();
		return `${base}\t- ${n.type ? `${n.type}: ` : ''}${text}`;
	});
	return [`${base}[NOTES]`, ...lines, `${base}[/NOTES]`].join('\n');
}

/** The whitespace opening the line `offset` sits on — what the opener is
 * indented by, so an attribute written under it lines up. */
function lineIndent(source: string, offset: number): string {
	const start = source.lastIndexOf('\n', offset - 1) + 1;
	return source.slice(start, offset).match(/^[\t ]*/)?.[0] ?? '';
}

function titleOf(attrs: Attrs): string {
	const title = attrs['title'];
	return title && title.kind === 'string' ? title.raw : '';
}

/** The entity and, optionally, the example block the target names. */
interface Located {
	/** The opener a new [NOTES] block goes under. */
	openerSpan: { start: number; end: number };
	/** The [NOTES] block already there, if any. */
	notesSpan: { start: number; end: number } | null;
	/** What a block one level inside this opener is indented by. */
	bodyIndent: string;
}

const NESTED_NOTES_RE = /^[ \t]*\[NOTES\][ \t]*$/im;

function locate(source: string, entities: Entity[], target: NoteTarget): Located {
	const entity = entities.find((e) => slugifyTitle(titleOf(e.attrs)) === target.entitySlug);
	if (!entity) {
		throw new NoteTargetError(`No entity with the slug "${target.entitySlug}" in this file.`);
	}
	const indentOf = (offset: number) => lineIndent(source, offset);

	if (!target.exampleTitle) {
		const notes = entity.blocks.find((b: SubBlock) => b.kind === 'notes');
		return {
			openerSpan: entity.openerSpan,
			notesSpan: notes ? notes.span : null,
			bodyIndent: `${indentOf(entity.openerSpan.start)}\t`,
		};
	}

	const example = entity.blocks.find(
		(b: SubBlock) => b.kind === 'example' && titleOf(b.attrs) === target.exampleTitle,
	);
	if (!example) {
		throw new NoteTargetError(
			`No [EXAMPLE] titled "${target.exampleTitle}" in "${titleOf(entity.attrs)}".`,
		);
	}
	// An example's [NOTES] is inside its body, which the scanner captures whole
	// rather than nesting — so it is found by scanning that span.
	const body = source.slice(example.bodySpan.start, example.bodySpan.end);
	const open = NESTED_NOTES_RE.exec(body);
	let notesSpan: { start: number; end: number } | null = null;
	if (open) {
		const closeAt = body.toUpperCase().indexOf('[/NOTES]', open.index);
		if (closeAt !== -1) {
			notesSpan = {
				start: example.bodySpan.start + open.index + (open[0].length - open[0].trimStart().length),
				end: example.bodySpan.start + closeAt + '[/NOTES]'.length,
			};
		}
	}
	return {
		openerSpan: example.openerSpan,
		notesSpan,
		bodyIndent: `${indentOf(example.openerSpan.start)}\t`,
	};
}

/**
 * Return `source` with the target opener's `notes` carrying exactly `notes`.
 *
 * Replaces the attribute where one is already written, removes it when the
 * list is emptied, and otherwise adds it just inside the opener's closing
 * bracket. Throws `NoteTargetError` when the target names nothing.
 */
export function writeNotes(source: string, target: NoteTarget, notes: DocNote[]): string {
	const file = scanSdoc(source);
	const { openerSpan, notesSpan, bodyIndent } = locate(source, file.entities, target);
	const text = serializeNotes(notes, bodyIndent);

	// Replace the block that is there.
	if (notesSpan) {
		if (!text) {
			// Take the whole line, and the blank line after it if the removal
			// would otherwise leave two in a row.
			let from = notesSpan.start;
			while (from > 0 && source[from - 1] !== '\n') from--;
			let to = notesSpan.end;
			while (to < source.length && source[to] !== '\n') to++;
			to = Math.min(to + 1, source.length);
			if (source.slice(to).startsWith('\n') && source.slice(0, from).endsWith('\n\n')) to++;
			return source.slice(0, from) + source.slice(to);
		}
		let from = notesSpan.start;
		while (from > 0 && source[from - 1] !== '\n') from--;
		return source.slice(0, from) + text + source.slice(notesSpan.end);
	}
	if (!text) return source;

	// Otherwise open one directly under the opener, where it renders: notes sit
	// above everything else the block holds.
	let after = openerSpan.end;
	while (after < source.length && source[after] !== '\n') after++;
	after = Math.min(after + 1, source.length);
	const blank = source.slice(after).startsWith('\n') ? '' : '\n';
	return `${source.slice(0, after)}\n${text}\n${blank}${source.slice(after)}`;
}
