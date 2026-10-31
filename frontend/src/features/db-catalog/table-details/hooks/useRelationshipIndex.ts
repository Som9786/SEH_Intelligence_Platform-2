import { useQuery } from '@tanstack/react-query';
import { fileRelationshipGraphService } from '../../../../platform/files/adapters/FileRelationshipGraphService';
import { useCatalogDatabase } from '../../../../platform/files/catalogDatabase';

export function useRelationshipIndex() {
  const database = useCatalogDatabase();
  return useQuery({
    queryKey: ['relationship-index', database],
    queryFn: () => fileRelationshipGraphService.getRelationshipIndex(),
    staleTime: Infinity,
    retry: false,
  });
}
