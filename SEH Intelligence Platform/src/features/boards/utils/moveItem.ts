/** A copy of the list with the item at `from` moved to `to`; the list itself when either is out of range. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  )
    return list;
  const moved = [...list];
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);
  return moved;
}
