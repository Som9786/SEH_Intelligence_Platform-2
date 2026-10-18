import { useSyncExternalStore } from 'react';
import type { GroupMode } from '../utils/groupTablesByArea';

interface SidebarFilterState {
  query: string;
  groupMode: GroupMode;
  expandedAreas: ReadonlySet<string>;
}

const initial: SidebarFilterState = {
  query: '',
  groupMode: 'all',
  expandedAreas: new Set(),
};
let state = initial;
const listeners = new Set<() => void>();
const update = (patch: Partial<SidebarFilterState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const sidebarFilterActions = {
  setQuery: (query: string) => update({ query: query.slice(0, 200) }),
  setGroupMode: (groupMode: GroupMode) => update({ groupMode }),
  toggleArea: (key: string) => {
    const next = new Set(state.expandedAreas);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update({ expandedAreas: next });
  },
  reset: () => {
    state = initial;
    listeners.forEach((listener) => listener());
  },
};

export function useSidebarFilter() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
