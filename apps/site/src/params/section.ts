import type { ParamMatcher } from '@sveltejs/kit';
import { SECTION_SLUGS } from '$lib/sections';

export const match: ParamMatcher = (param) => SECTION_SLUGS.includes(param);
