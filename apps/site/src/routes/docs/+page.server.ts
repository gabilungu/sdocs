import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// The docs lived under /docs before the site split into sections; keep the
// old entry point working.
export const load = () => {
	redirect(301, `${base}/explorer`);
};
