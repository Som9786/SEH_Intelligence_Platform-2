import { describe, expect, it } from 'vitest';
import { moveItem } from './moveItem';

describe('moveItem', () => {
  it('moves an item later, into the place of the one it is dropped on', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item earlier', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('leaves the list as it is when nothing moves or the place is out of range', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 2)).toBe(list);
  });
});
