/** Lightweight source helpers shared by diagnostics and completions. */

/** Runtime-value identifiers imported in the file (type-only imports excluded). */
export function importedIdentifiers(text: string): Set<string> {
	const names = new Set<string>();
	for (const match of text.matchAll(/^\s*import\s+([^'"]+?)\s+from\s+['"]/gm)) {
		let clause = match[1].trim();
		if (/^type\b/.test(clause)) continue; // import type ... — no runtime value
		const named = /\{([^}]*)\}/.exec(clause);
		if (named) {
			for (const spec of named[1].split(',')) {
				const parts = spec.trim();
				if (!parts || /^type\b/.test(parts)) continue;
				const alias = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(parts);
				names.add(alias ? alias[1] : parts.split(/\s+/)[0]);
			}
			clause = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
		}
		const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause);
		if (ns) names.add(ns[1]);
		const def = /^([A-Za-z_$][\w$]*)/.exec(clause);
		if (def) names.add(def[1]);
	}
	return names;
}
