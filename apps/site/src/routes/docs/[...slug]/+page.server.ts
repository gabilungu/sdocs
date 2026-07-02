import { error } from '@sveltejs/kit';
import { getDoc, getNav, getSlugs } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => {
	return getSlugs().map((slug) => ({ slug }));
};

export const load: PageServerLoad = async ({ params }) => {
	const doc = await getDoc(params.slug);
	if (!doc) error(404, 'Page not found');
	return { ...doc, nav: getNav() };
};
