import { useSyncExternalStore } from 'react';
import type { GroupMode } from '../utils/groupTablesByArea';

interface TableFilterState {
  query: string;
  groupMode: GroupMode;
  expandedAreas: ReadonlySet<string>;
  /** The table filter flyout is showing. */
  flyoutOpen: boolean;
}

const initial: TableFilterState = {
  query: '',
  groupMode: 'all',
  expandedAreas: new Set(),
  flyoutOpen: false,
};
let state = initial;
const listeners = new Set<() => void>();
const update = (patch: Partial<TableFilterState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const tableFilterActions = {
  setQuery: (query: string) => update({ query: query.slice(0, 200) }),
  setGroupMode: (groupMode: GroupMode) => update({ groupMode }),
  setFlyoutOpen: (flyoutOpen: boolean) => update({ flyoutOpen }),
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

export function useTableFilter() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
