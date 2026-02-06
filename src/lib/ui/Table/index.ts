import TableRoot from './Table.svelte';
import Head from './Head.svelte';
import Body from './Body.svelte';
import Foot from './Foot.svelte';
import Row from './Row.svelte';
import Header from './Header.svelte';
import Cell from './Cell.svelte';
import Caption from './Caption.svelte';

const Table = Object.assign(TableRoot, { Head, Body, Foot, Row, Header, Cell, Caption });

export { Table, Head, Body, Foot, Row, Header, Cell, Caption };
