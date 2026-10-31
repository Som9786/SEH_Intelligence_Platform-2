import { describe, expect, it } from 'vitest';
import { pickCatalogDatabase, type CatalogDatabase } from './catalogDatabase';

const db = (name: string, isDefault = false): CatalogDatabase => ({
  name,
  title: name,
  default: isDefault,
});

describe('pickCatalogDatabase', () => {
  const databases = [db('Retail'), db('Warehouse', true), db('Finance')];

  it('keeps the selected database while DB Catalog still has it', () => {
    expect(pickCatalogDatabase(databases, 'Finance')).toBe('Finance');
  });

  it('falls back to the default database when the selected one is gone', () => {
    expect(pickCatalogDatabase(databases, 'Old')).toBe('Warehouse');
    expect(pickCatalogDatabase(databases, null)).toBe('Warehouse');
  });

  it('falls back to the first database without a default, and to none without databases', () => {
    expect(pickCatalogDatabase([db('Retail'), db('Finance')], null)).toBe(
      'Retail',
    );
    expect(pickCatalogDatabase([], 'Retail')).toBeNull();
  });
});
