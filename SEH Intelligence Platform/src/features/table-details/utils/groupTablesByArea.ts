import type { TableListItem } from '../types/tableDetails';

export type GroupMode = 'area' | 'all';
export interface TableGroup {
  key: string;
  label: string;
  tables: TableListItem[];
}

export const UNASSIGNED_KEY = 'unassigned';

export function groupTablesByArea(
  tables: TableListItem[],
  mode: GroupMode,
): { groups: TableGroup[]; total: number } {
  const map = new Map<string, TableGroup>();
  const add = (key: string, label: string, table: TableListItem) => {
    const group = map.get(key) ?? { key, label, tables: [] };
    group.tables.push(table);
    map.set(key, group);
  };
  for (const table of tables) {
    if (mode === 'all') add(table.schemaName, table.schemaName, table);
    else if (table.areas.length === 0) add(UNASSIGNED_KEY, 'Unassigned', table);
    else for (const area of table.areas) add(area.id, area.name, table);
  }
  const groups = [...map.values()].sort((a, b) => {
    if (a.key === UNASSIGNED_KEY) return 1;
    if (b.key === UNASSIGNED_KEY) return -1;
    return a.label.localeCompare(b.label);
  });
  return { groups, total: new Set(tables.map((table) => table.id)).size };
}
