import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { listSchedules } from '../../../platform/api/workspaceService';
import { useAuth } from '../../auth/useAuth';
import { BoardWidgets } from '../components/BoardWidgets';

/** Basket Intelligence board: answers about baskets, items, stores and offers, kept as widgets. */
export function BasketIntelligencePage() {
  const canSchedule = useAuth().can('scheduled-insights');
  // The same query as Scheduled Insights and the widgets' schedule lines, so it is fetched once.
  const schedules = useQuery({
    queryKey: ['workspace', 'schedules'],
    queryFn: listSchedules,
    enabled: canSchedule,
  });
  return (
    <div className="page-content">
      <PageHeading
        title="Basket Intelligence"
        description="Understand which products customers buy together. Pin answers from Insights Assistant here and refresh them for the latest data."
        badge={
          canSchedule && (
            <div className="td-actions">
              <Link to="/scheduled-insights" className="td-action">
                <CalendarClock size={16} aria-hidden="true" />
                Scheduled insights
                {schedules.data ? ` (${schedules.data.length})` : ''}
              </Link>
            </div>
          )
        }
      />
      <BoardWidgets board="basket-intelligence" />
    </div>
  );
}
