import { useQuery } from '@tanstack/react-query';
import { fileDocumentationService } from '../../../../platform/files/adapters/FileDocumentationService';
import { useCatalogDatabase } from '../../../../platform/files/catalogDatabase';

export function useDatabaseDocumentation(document = 'database-overview') {
  const database = useCatalogDatabase();
  return useQuery({
    queryKey: ['documentation', 'database', database, document],
    queryFn: () => fileDocumentationService.getDatabaseDocumentation(document),
    retry: false,
  });
}
