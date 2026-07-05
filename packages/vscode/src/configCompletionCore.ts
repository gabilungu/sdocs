import type { ConfigSchema } from 'sdocs/language';

/** Where the cursor sits inside a config object literal. */
export interface ConfigContext {
	/** Object-key path from the root config object to the enclosing object. */
	path: string[];
	/** The key whose value is being typed, when the cursor is in value position. */
	valueKey: string | null;
	/** Keys already present in the enclosing object (to avoid re-offering them). */
	siblings: string[];
}

const WORD = /[A-Za-z0-9_$]/;

/**
 * Walk the config source up to `offset` and report which object the cursor is
 * in. A brace stack tracks nesting; the first object opened is the exported
 * config root, so its nested keys form the path. Strings and comments are
 * skipped so braces/colons inside them don't perturb the structure.
 *
 * Returns null when the cursor isn't inside the config object at all.
 */
export function scanContext(text: string, offset: number): ConfigContext | null {
	const keyStack: (string | null)[] = [];
	const frames: Set<string>[] = [];
	let lastWord: string | null = null;
	let pendingKey: string | null = null; // key awaiting a value after ':'
	let brackets = 0; // depth of [] and () — commas/colons there aren't object keys
	let i = 0;
	const n = Math.min(offset, text.length);

	while (i < n) {
		const c = text[i];

		if (c === '"' || c === "'" || c === '`') {
			const quote = c;
			i++;
			while (i < n && text[i] !== quote) {
				if (text[i] === '\\') i++;
				i++;
			}
			i++;
			lastWord = null;
			continue;
		}
		if (c === '/' && text[i + 1] === '/') {
			i += 2;
			while (i < n && text[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
			i += 2;
			continue;
		}
		if (c === '{') {
			keyStack.push(pendingKey);
			frames.push(new Set());
			pendingKey = null;
			lastWord = null;
			i++;
			continue;
		}
		if (c === '}') {
			keyStack.pop();
			frames.pop();
			pendingKey = null;
			lastWord = null;
			i++;
			continue;
		}
		if (c === '[' || c === '(') {
			brackets++;
			lastWord = null;
			i++;
			continue;
		}
		if (c === ']' || c === ')') {
			if (brackets > 0) brackets--;
			lastWord = null;
			i++;
			continue;
		}
		if (c === ':') {
			if (brackets === 0) {
				pendingKey = lastWord;
				if (lastWord && frames.length) frames[frames.length - 1].add(lastWord);
			}
			lastWord = null;
			i++;
			continue;
		}
		if (c === ',') {
			if (brackets === 0) pendingKey = null;
			lastWord = null;
			i++;
			continue;
		}
		if (WORD.test(c)) {
			let j = i;
			while (j < n && WORD.test(text[j])) j++;
			lastWord = text.slice(i, j);
			i = j;
			continue;
		}
		i++;
	}

	if (keyStack.length === 0) return null;
	// keyStack[0] is the root config object (no key); nested keys form the path.
	const path = keyStack.slice(1).filter((k): k is string => k !== null);
	const siblings = [...(frames[frames.length - 1] ?? [])];
	return { path, valueKey: pendingKey, siblings };
}

/** Descend the schema along a path of object keys; null if the path is invalid. */
export function objectAt(schema: ConfigSchema, path: string[]): ConfigSchema | null {
	let current: ConfigSchema = schema;
	for (const key of path) {
		const field = current[key];
		if (!field?.object) return null;
		current = field.object;
	}
	return current;
}

/**
 * Is the cursor typing a value (right of a `key:`)? Returns whether that value
 * is already inside a quote, so callers know not to add their own.
 */
export function valuePosition(linePrefix: string): { inString: boolean } | null {
	const m = /:\s*(['"]?)[\w$-]*$/.exec(linePrefix);
	if (!m) return null;
	return { inString: m[1] !== '' };
}
