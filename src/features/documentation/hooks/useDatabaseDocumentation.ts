import { useQuery } from '@tanstack/react-query';
import { fileDocumentationService } from '../../../platform/files/adapters/FileDocumentationService';

export function useDatabaseDocumentation(document = 'database-overview') {
  return useQuery({
    queryKey: ['documentation', 'database', document],
    queryFn: () => fileDocumentationService.getDatabaseDocumentation(document),
    retry: false,
  });
}
