import type { GraphEdge } from '../../table-details/utils/relationshipGraph';

/** One table as the explorer draws it. Built from the catalog, nothing here is invented. */
export interface ErColumn {
  name: string;
  dataType: string;
  pk: boolean;
  fk: boolean;
}

export interface ErTable {
  id: string;
  name: string;
  schema: string;
  description: string | null;
  descriptionInferred: boolean;
  rowCount: number | null;
  columnCount: number;
  areas: { id: string; name: string }[];
  columns: ErColumn[];
}

export const CARD_WIDTH = 274;
const HEADER_HEIGHT = 52;
const ROW_HEIGHT = 30;
const FOOT_HEIGHT = 0;
const MORE_HEIGHT = 26;
const GAP_X = 180;
const GAP_Y = 56;
const PAD = 40;
/** Columns drawn on a card; key columns come first, the rest is "+N more". */
export const MAX_ROWS = 6;

export interface CardColumns {
  shown: ErColumn[];
  hidden: number;
}

/** Which columns a card shows: keys first; with "keys only" nothing else. */
export function cardColumns(table: ErTable, keysOnly: boolean): CardColumns {
  const keys = table.columns.filter((c) => c.pk || c.fk);
  if (keysOnly) return { shown: keys, hidden: 0 };
  const rest = table.columns.filter((c) => !c.pk && !c.fk);
  const ordered = [...keys, ...rest];
  const shown = ordered.slice(0, MAX_ROWS);
  return { shown, hidden: ordered.length - shown.length };
}

function cardHeight(columns: CardColumns): number {
  return (
    HEADER_HEIGHT +
    Math.max(columns.shown.length, 1) * ROW_HEIGHT +
    (columns.hidden > 0 ? MORE_HEIGHT : 0) +
    FOOT_HEIGHT
  );
}

export interface PlacedCard {
  table: ErTable;
  columns: CardColumns;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

export interface PlacedEdge {
  edge: GraphEdge;
  path: string;
  /** Label centre. */
  lx: number;
  ly: number;
}

export interface ErLayout {
  cards: PlacedCard[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

/**
 * Referenced tables sit to the left of the tables that reference them. A table's column is one past
 * its deepest parent, so a chain of foreign keys reads left to right. Cycles stop growing after as
 * many passes as there are tables.
 */
function assignLayers(ids: string[], edges: GraphEdge[]): Map<string, number> {
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (e.from === e.to) continue;
      const wanted = (layer.get(e.to) ?? 0) + 1;
      if ((layer.get(e.from) ?? 0) < wanted && wanted < ids.length) {
        layer.set(e.from, wanted);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

/** Position the cards and route one curve per relationship. Pure, so it is easy to test. */
export function layoutEr(
  tables: ErTable[],
  edges: GraphEdge[],
  keysOnly: boolean,
): ErLayout {
  const byId = new Map(tables.map((t) => [t.id, t] as const));
  const usable = edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const linked = new Set(usable.flatMap((e) => [e.from, e.to]));
  const connected = tables.filter((t) => linked.has(t.id));
  const isolated = tables.filter((t) => !linked.has(t.id));

  const layers = assignLayers(
    connected.map((t) => t.id),
    usable,
  );
  const layerCount = Math.max(0, ...[...layers.values()]) + 1;
  const columns = new Map(
    tables.map((t) => [t.id, cardColumns(t, keysOnly)] as const),
  );

  // Order inside a column by the average position of the tables it connects to on the left,
  // which keeps most connectors from crossing.
  const order = new Map<string, number>();
  const groups: ErTable[][] = Array.from({ length: layerCount }, () => []);
  for (const t of connected) groups[layers.get(t.id) ?? 0].push(t);
  groups.forEach((group, li) => {
    const score = (t: ErTable) => {
      const near = usable
        .filter((e) => e.from === t.id || e.to === t.id)
        .map((e) => (e.from === t.id ? e.to : e.from))
        .filter((id) => (layers.get(id) ?? 0) < li && order.has(id))
        .map((id) => order.get(id) ?? 0);
      return near.length
        ? near.reduce((a, b) => a + b, 0) / near.length
        : Number.MAX_SAFE_INTEGER;
    };
    group.sort(
      (a, b) =>
        score(a) - score(b) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    group.forEach((t, i) => order.set(t.id, i));
  });

  const heights = groups.map(
    (group) =>
      group.reduce((sum, t) => sum + cardHeight(columns.get(t.id)!), 0) +
      Math.max(0, group.length - 1) * GAP_Y,
  );
  const tallest = Math.max(0, ...heights);
  const cards: PlacedCard[] = [];
  groups.forEach((group, li) => {
    let y = PAD + (tallest - heights[li]) / 2;
    for (const t of group) {
      const cols = columns.get(t.id)!;
      const height = cardHeight(cols);
      cards.push({
        table: t,
        columns: cols,
        x: PAD + li * (CARD_WIDTH + GAP_X),
        y,
        width: CARD_WIDTH,
        height,
        layer: li,
      });
      y += height + GAP_Y;
    }
  });

  // Tables without relationships go in a grid under the connected ones.
  const gridColumns = Math.max(layerCount, 2);
  let rowTop = PAD + (connected.length ? tallest + GAP_Y * 1.5 : 0);
  for (let i = 0; i < isolated.length; i += gridColumns) {
    const row = isolated.slice(i, i + gridColumns);
    const rowHeight = Math.max(
      ...row.map((t) => cardHeight(columns.get(t.id)!)),
    );
    row.forEach((t, c) => {
      const cols = columns.get(t.id)!;
      cards.push({
        table: t,
        columns: cols,
        x: PAD + c * (CARD_WIDTH + GAP_X),
        y: rowTop,
        width: CARD_WIDTH,
        height: cardHeight(cols),
        layer: -1,
      });
    });
    rowTop += rowHeight + GAP_Y;
  }

  const placed = new Map(cards.map((c) => [c.table.id, c] as const));

  // Connectors leave from the right of the left-hand card and enter the left of the other. Several
  // connectors on one side are spread along it so they do not sit on top of each other.
  type Side = 'left' | 'right';
  const slots = new Map<string, { key: string; other: number }[]>();
  const sideOf = (e: GraphEdge, end: 'from' | 'to'): Side => {
    const a = placed.get(e.from)!;
    const b = placed.get(e.to)!;
    if (a === b) return 'right';
    if (a.x === b.x) return 'right';
    const leftFirst = a.x < b.x;
    return end === 'from'
      ? leftFirst
        ? 'right'
        : 'left'
      : leftFirst
        ? 'left'
        : 'right';
  };
  usable.forEach((e) => {
    for (const end of ['from', 'to'] as const) {
      const id = e[end];
      const other = placed.get(end === 'from' ? e.to : e.from)!;
      const key = `${id}|${sideOf(e, end)}`;
      const list = slots.get(key) ?? [];
      list.push({ key: `${e.id}|${end}`, other: other.y });
      slots.set(key, list);
    }
  });
  for (const list of slots.values()) list.sort((a, b) => a.other - b.other);
  const anchorY = (e: GraphEdge, end: 'from' | 'to') => {
    const card = placed.get(e[end])!;
    const list = slots.get(`${e[end]}|${sideOf(e, end)}`)!;
    const i = list.findIndex((s) => s.key === `${e.id}|${end}`);
    return (
      card.y +
      HEADER_HEIGHT / 2 +
      ((card.height - FOOT_HEIGHT - HEADER_HEIGHT / 2) * (i + 1)) /
        (list.length + 1)
    );
  };

  const placedEdges: PlacedEdge[] = usable.map((edge) => {
    const a = placed.get(edge.from)!;
    const b = placed.get(edge.to)!;
    const y1 = anchorY(edge, 'from');
    const y2 = anchorY(edge, 'to');
    if (a === b) {
      const x = a.x + a.width;
      const out = 56;
      return {
        edge,
        path: `M ${x} ${y1} C ${x + out} ${y1}, ${x + out} ${y2}, ${x} ${y2}`,
        lx: x + out * 0.75,
        ly: (y1 + y2) / 2,
      };
    }
    if (a.x === b.x) {
      const x = a.x + a.width;
      const out = 64;
      return {
        edge,
        path: `M ${x} ${y1} C ${x + out} ${y1}, ${x + out} ${y2}, ${x} ${y2}`,
        lx: x + out * 0.75,
        ly: (y1 + y2) / 2,
      };
    }
    const leftFirst = a.x < b.x;
    const x1 = leftFirst ? a.x + a.width : a.x;
    const x2 = leftFirst ? b.x : b.x + b.width;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (leftFirst ? 1 : -1);
    return {
      edge,
      path: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      lx: (x1 + x2) / 2,
      ly: (y1 + y2) / 2,
    };
  });

  const right = Math.max(0, ...cards.map((c) => c.x + c.width));
  const bottom = Math.max(0, ...cards.map((c) => c.y + c.height));
  const loops = placedEdges.some(
    (e) =>
      e.edge.from === e.edge.to ||
      placed.get(e.edge.from)!.x === placed.get(e.edge.to)!.x,
  );
  return {
    cards,
    edges: placedEdges,
    width: right + PAD + (loops ? 60 : 0),
    height: bottom + PAD,
  };
}
