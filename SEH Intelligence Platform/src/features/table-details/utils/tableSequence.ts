export interface TableSequence {
  index: number;
  previousId: string | null;
  nextId: string | null;
}

export function buildTableSequence(
  ids: string[],
  selectedId: string,
): TableSequence {
  const index = selectedId ? ids.indexOf(selectedId) : -1;
  if (index < 0) return { index: -1, previousId: null, nextId: null };
  return {
    index,
    previousId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}
