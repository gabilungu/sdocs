/** Top-level content sections; each is a top-bar entry with its own sidebar. */
export const SECTIONS = [
	{ slug: 'explorer', title: 'Explorer' },
	{ slug: 'language', title: 'Language' },
	{ slug: 'cli', title: 'CLI' },
	{ slug: 'extension', title: 'Extension' }
] as const;

export const SECTION_SLUGS = SECTIONS.map((section) => section.slug) as string[];
