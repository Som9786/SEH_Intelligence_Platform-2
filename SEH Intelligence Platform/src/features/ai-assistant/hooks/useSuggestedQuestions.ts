import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import { loadSuggestedQuestions } from '../services/assistantService';

/** The questions Analytics and DB Guide suggest; empty lists while loading or for a user without Insights Assistant. */
export function useSuggestedQuestions() {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['assistant', 'suggestions'],
    queryFn: loadSuggestedQuestions,
    enabled: can('insights-assistant'),
    staleTime: 10 * 60_000,
  });
  return query.data ?? { data: [], structure: [] };
}
