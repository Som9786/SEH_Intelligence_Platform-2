import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  LayoutDashboard,
  Pencil,
  Trash2,
} from 'lucide-react';
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
} from '../../../platform/api/workspaceService';
import { ScheduleDialog } from '../components/ScheduleDialog';

/**
 * Scheduled insights: the questions the user scheduled from Insights Assistant, saved by
 * the workspace in Insights.Gateway. They can be paused, edited and deleted; running them is coming soon.
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
        description="Your saved questions in one place. They don't run on their own yet: until scheduled runs are switched on, ask one again to update it."
        badge={
          <div className="td-actions">
            <Link
              to="/basket-intelligence"
              className="td-action"
              title="Back to Basket Intelligence"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </Link>
          </div>
        }
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
            Add an answer to Basket Intelligence, then use the schedule button
            on its widget.
          </p>
          <Link
            to="/basket-intelligence"
            className="td-action td-action-primary"
          >
            <LayoutDashboard size={16} aria-hidden="true" />
            Open Basket Intelligence
          </Link>
        </div>
      )}
      {list.length > 0 && (
        <>
          <p className="si-count">
            {active} on · {list.length - active} paused
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
            Schedule more with the schedule button on a widget on Basket
            Intelligence.
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
          <dt>Would next run</dt>
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
          {schedule.enabled ? 'On · not running yet' : 'Paused'}
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
