import { useQuery } from '@tanstack/react-query';
import { fileRelationshipGraphService } from '../../../../platform/files/adapters/FileRelationshipGraphService';

export function useRelationshipIndex() {
  return useQuery({
    queryKey: ['relationship-index'],
    queryFn: () => fileRelationshipGraphService.getRelationshipIndex(),
    staleTime: Infinity,
    retry: false,
  });
}
