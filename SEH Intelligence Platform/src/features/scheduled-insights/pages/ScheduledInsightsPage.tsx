import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { PageHeading } from '../../../shared/components/PageHeading';
import {
  BOARD_LABEL,
  deleteSchedule,
  describeSchedule,
  formatWhen,
  listSchedules,
  plainText,
  updateSchedule,
  type Schedule,
  type ScheduleView,
} from '../../workspace/workspaceService';
import { ScheduleDialog } from '../components/ScheduleDialog';

/**
 * Scheduled insights: the questions the user scheduled from Insights Assistant, saved by
 * Insights.Workspace. They can be paused, edited and deleted; running them is coming soon.
 */
export function ScheduledInsightsPage() {
  const queryClient = useQueryClient();
  const schedules = useQuery({
    queryKey: ['workspace', 'schedules'],
    queryFn: listSchedules,
  });
  const [editing, setEditing] = useState<Schedule | null>(null);
  // The schedule whose Delete was clicked, while the user confirms.
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: ['workspace', 'schedules'],
    });
  const toggle = useMutation({
    mutationFn: (schedule: Schedule) =>
      updateSchedule(schedule.id, { ...schedule, enabled: !schedule.enabled }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (schedule: Schedule) => deleteSchedule(schedule.id),
    onSuccess: refresh,
  });

  const list = schedules.data ?? [];
  const active = list.filter((view) => view.schedule.enabled).length;
  const failure = toggle.error ?? remove.error;

  return (
    <div className="page-content">
      <PageHeading
        title="Scheduled Insights"
        description="Your saved questions in one place. Soon they'll run on their own and keep you up to date."
      />
      {schedules.isPending && (
        <div className="state-panel" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>Loading your schedules…</p>
        </div>
      )}
      {schedules.isError && (
        <div className="ia-error" role="alert">
          <p>{schedules.error.message}</p>
          <button
            type="button"
            className="td-action"
            onClick={() => void schedules.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      {schedules.isSuccess && list.length === 0 && (
        <div className="state-panel si-empty">
          <CalendarClock size={28} aria-hidden="true" />
          <h2>No schedules yet</h2>
          <p>
            Ask Insights Assistant a question about the sales data, then use
            “Schedule this” on the answer.
          </p>
          <Link
            to="/insights-assistant"
            className="td-action td-action-primary"
          >
            <MessageSquare size={16} aria-hidden="true" />
            Ask Insights Assistant
          </Link>
        </div>
      )}
      {list.length > 0 && (
        <>
          <p className="si-count">
            {active} active · {list.length - active} paused
          </p>
          {failure && (
            <p className="ia-error" role="alert">
              {failure.message}
            </p>
          )}
          <ul className="panel si-list">
            {list.map((view) => (
              <ScheduleRow
                key={view.schedule.id}
                view={view}
                busy={toggle.isPending || remove.isPending}
                onToggle={() => toggle.mutate(view.schedule)}
                onEdit={() => setEditing(view.schedule)}
                onDelete={() => setDeleting(view.schedule)}
              />
            ))}
          </ul>
          <p className="si-foot">
            Schedule more from any Insights Assistant answer about the sales
            data with “Schedule this”.
          </p>
        </>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete schedule?"
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove.mutate(deleting);
            setDeleting(null);
          }}
        >
          “{deleting.name}” will no longer be scheduled. A widget it refreshes
          stays on its board.
        </ConfirmDialog>
      )}
      {editing && (
        <ScheduleDialog
          question={editing.question}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ScheduleRow({
  view: { schedule, nextRunAt },
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  view: ScheduleView;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`si-row${schedule.enabled ? '' : ' si-row-paused'}`}>
      <div className="si-question">
        <h3>{schedule.name}</h3>
        <p>{schedule.question}</p>
        {schedule.answer && (
          <p className="si-answer" title={plainText(schedule.answer)}>
            When scheduled: {plainText(schedule.answer)}
          </p>
        )}
        {schedule.board && (
          <span className="td-chip td-chip-area">
            {BOARD_LABEL[schedule.board]}
          </span>
        )}
      </div>
      <dl className="si-meta">
        <div>
          <dt>Frequency</dt>
          <dd>{describeSchedule(schedule)}</dd>
        </div>
        <div>
          <dt>Next run</dt>
          <dd>{nextRunAt ? formatWhen(nextRunAt) : 'Paused'}</dd>
        </div>
      </dl>
      <div className="si-actions">
        <button
          type="button"
          role="switch"
          aria-checked={schedule.enabled}
          aria-label={`${schedule.enabled ? 'Pause' : 'Resume'} ${schedule.name}`}
          className={`si-switch${schedule.enabled ? ' si-switch-on' : ''}`}
          disabled={busy}
          onClick={onToggle}
        />
        <span className="si-state">
          {schedule.enabled ? 'Active' : 'Paused'}
        </span>
        <button type="button" className="td-action" onClick={onEdit}>
          <Pencil size={15} aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          className="td-action"
          aria-label={`Delete ${schedule.name}`}
          title="Delete"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
