import Root from './NavTree.svelte';
import Item from './Item.svelte';
import Group from './Group.svelte';

// Explicit annotation: the inferred intersection would name the components'
// internal Props types, which declaration emit can't reference.
const NavTree: typeof Root & { Item: typeof Item; Group: typeof Group } = Object.assign(Root, {
	Item,
	Group,
});
export { NavTree, Item, Group };
export default NavTree;
