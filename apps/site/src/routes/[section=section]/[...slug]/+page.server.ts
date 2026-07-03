import { error } from '@sveltejs/kit';
import { getDoc, getNav, getEntries } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getEntries();

export const load: PageServerLoad = async ({ params }) => {
	const doc = await getDoc(params.section, params.slug);
	if (!doc) error(404, 'Page not found');
	return { ...doc, nav: getNav(params.section) };
};
