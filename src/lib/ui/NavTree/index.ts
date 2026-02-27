import Root from './NavTree.svelte';
import Item from './Item.svelte';
import Group from './Group.svelte';

const NavTree = Object.assign(Root, { Item, Group });
export { NavTree, Item, Group };
export default NavTree;
