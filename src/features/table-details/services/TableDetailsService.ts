import type {
  TablePage,
  TableRecord,
  ListFilters,
} from '../types/tableDetails';

export interface TableDetailsService {
  listTables(filters: ListFilters): Promise<TablePage>;
  getTable(id: string): Promise<TableRecord>;
}
