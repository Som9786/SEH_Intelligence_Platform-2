import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  Database,
  ExternalLink,
  GripVertical,
  LayoutDashboard,
  MessageSquare,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router';
import { Prose } from '../../insights-assistant/components/AssistantAnswer';
import { ResultVisual } from '../../insights-assistant/components/ResultVisual';
import {
  asChart,
  chartSize,
  chooseChart,
} from '../../insights-assistant/utils/chartChoice';
import { useAuth } from '../../auth/useAuth';
import { ScheduleDialog } from '../../scheduled-insights/components/ScheduleDialog';
import {
  ageOf,
  deleteWidget,
  describeSchedule,
  formatWhen,
  listSchedules,
  listWidgets,
  refreshWidget,
  renameWidget,
  reorderWidgets,
  widgetPagePath,
  type Board,
  type ScheduleView,
  type Widget,
} from '../../../platform/api/workspaceService';
import { ShareDialog } from '../../shared-insights/components/ShareDialog';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { moveItem } from '../utils/moveItem';

const sameQuestion = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() ===
  b.trim().replace(/\s+/g, ' ').toLowerCase();

/** The schedule that asks this widget's question for its board, if there is one. */
const scheduleOf = (widget: Widget, schedules: ScheduleView[]) =>
  schedules.find(
    ({ schedule }) =>
      sameQuestion(schedule.question, widget.question) &&
      (!schedule.board || schedule.board === widget.board),
  );

/**
 * A scheduled widget's line: when it would refresh on its own. Schedules are saved but not run yet,
 * so it says auto-refresh starts once scheduled runs are switched on.
 */
function ScheduleStatus({ view }: { view: ScheduleView }) {
  const { schedule, nextRunAt } = view;
  return (
    <p className={`bw-schedule${schedule.enabled ? '' : ' is-paused'}`}>
      <RefreshCw size={13} aria-hidden="true" />
      {schedule.enabled ? (
        <span>
          <strong>Auto-refresh (not running yet):</strong>{' '}
          {describeSchedule(schedule)}
          {nextRunAt && <> · would run next {formatWhen(nextRunAt)}</>}
          <span className="bw-schedule-note">
            {' '}
            — use Refresh to update it until scheduled runs are switched on
          </span>
        </span>
      ) : (
        <span>
          <strong>Schedule paused:</strong> {describeSchedule(schedule)}. Resume
          it on Scheduled Insights to refresh this widget on its own.
        </span>
      )}
    </p>
  );
}

/**
 * How fresh a widget's data is: when its rows were last read from the database, and how long ago.
 * Refresh reads them again.
 */
function DataStatus({ widget }: { widget: Widget }) {
  // Widgets saved before the fetch time was recorded: the data was read just before adding.
  const fetched = widget.fetchedAt ?? widget.createdAt;
  return (
    <dl className="bw-status">
      <div>
        <dt>
          <Database size={13} aria-hidden="true" />
          Data synced
        </dt>
        <dd>
          <time dateTime={fetched}>{formatWhen(fetched)}</time>{' '}
          <span className="bw-age">({ageOf(fetched)})</span>
        </dd>
      </div>
    </dl>
  );
}

/** How a card takes part in drag and drop: moved by its grip, by mouse or the arrow keys. */
interface CardDrag {
  /** A card is being dragged, so this one can take it. */
  active: boolean;
  dragging: boolean;
  over: boolean;
  onStart: () => void;
  onEnd: () => void;
  onOver: () => void;
  onDrop: () => void;
  /** One place earlier (-1) or later (1). */
  onStep: (step: -1 | 1) => void;
}

/**
 * The answers the user added to this board from Insights Assistant; each can be refreshed, and
 * dragged by its grip to another place on the board, which is kept.
 */
export function BoardWidgets({ board }: { board: Board }) {
  const queryClient = useQueryClient();
  const widgetsKey = ['workspace', 'widgets', board];
  const widgets = useQuery({
    queryKey: widgetsKey,
    queryFn: () => listWidgets(board),
  });
  // Shown in the new order at once, and saved one move at a time.
  const reorder = useMutation({
    mutationFn: (arranged: Widget[]) =>
      reorderWidgets(
        board,
        arranged.map((w) => w.id),
      ),
    // A reload already on its way would bring back the old order, so it's cancelled first; once the
    // order is saved (or fails), the board is read again so it shows what was kept.
    onMutate: async (arranged) => {
      await queryClient.cancelQueries({ queryKey: widgetsKey });
      queryClient.setQueryData<Widget[]>(widgetsKey, arranged);
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: widgetsKey }),
    scope: { id: `reorder-${board}` },
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Said by screen readers after a move, since the card's new place can't be seen.
  const [moved, setMoved] = useState('');
  // Schedules, to show which widgets refresh on their own. Only for users who can schedule.
  const canSchedule = useAuth().can('scheduled-insights');
  const schedules = useQuery({
    queryKey: ['workspace', 'schedules'],
    queryFn: listSchedules,
    enabled: canSchedule,
  });
  // The widget whose Remove was clicked, while the user confirms.
  const [removing, setRemoving] = useState<Widget | null>(null);
  const remove = useMutation({
    mutationFn: (widget: Widget) => deleteWidget(widget.id),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'widgets', board],
      }),
  });

  if (widgets.isPending)
    return (
      <div className="state-panel" role="status">
        <span className="spinner" aria-hidden="true" />
        <p>Loading widgets…</p>
      </div>
    );
  if (widgets.isError)
    return (
      <div className="ia-error" role="alert">
        <p>{widgets.error.message}</p>
        <button
          type="button"
          className="td-action"
          onClick={() => void widgets.refetch()}
        >
          Try again
        </button>
      </div>
    );
  if (widgets.data.length === 0)
    return (
      <div className="state-panel">
        <LayoutDashboard size={28} aria-hidden="true" />
        <h2>No widgets yet</h2>
        <p>
          Ask Insights Assistant about baskets, items, stores or offers, then
          use “Add to Basket Intelligence” on the answer.
        </p>
        <Link to="/insights-assistant" className="td-action td-action-primary">
          <MessageSquare size={16} aria-hidden="true" />
          Ask Insights Assistant
        </Link>
      </div>
    );

  const list = widgets.data;
  const move = (from: number, to: number) => {
    const arranged = moveItem(list, from, to);
    if (arranged === list) return;
    reorder.mutate(arranged);
    const place = arranged.indexOf(list[from]) + 1;
    setMoved(`Moved ${list[from].title} to place ${place} of ${list.length}.`);
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };

  return (
    <>
      {remove.error && (
        <p className="ia-error" role="alert">
          {remove.error.message}
        </p>
      )}
      {reorder.error && (
        <p className="ia-error" role="alert">
          Couldn't keep the new order: {reorder.error.message}
        </p>
      )}
      <p className="td-sr-only" role="status">
        {moved}
      </p>
      <ul className="bw-grid">
        {list.map((widget, index) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            drag={{
              active: dragging !== null,
              dragging: dragging === widget.id,
              over: over === widget.id && dragging !== widget.id,
              onStart: () => setDragging(widget.id),
              onEnd: endDrag,
              onOver: () => setOver(widget.id),
              onDrop: () => {
                move(
                  list.findIndex((w) => w.id === dragging),
                  index,
                );
                endDrag();
              },
              onStep: (step) => move(index, index + step),
            }}
            canSchedule={canSchedule}
            schedule={scheduleOf(widget, schedules.data ?? [])}
            removing={remove.isPending}
            onRemove={() => setRemoving(widget)}
          />
        ))}
      </ul>
      {removing && (
        <ConfirmDialog
          title="Remove widget?"
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            remove.mutate(removing);
            setRemoving(null);
          }}
        >
          “{removing.title}” will be removed from this board. Its schedule and
          any links you shared stay as they are.
        </ConfirmDialog>
      )}
    </>
  );
}

/** The longest heading a widget keeps (MaxTitle in the gateway's WorkspaceEndpoints). */
const MAX_TITLE = 200;

/**
 * One widget, with a grip to move it and buttons to rename it, schedule it, refresh its data
 * from the database and remove it.
 */
function WidgetCard({
  widget,
  drag,
  canSchedule,
  schedule,
  removing,
  onRemove,
}: {
  widget: Widget;
  drag: CardDrag;
  canSchedule: boolean;
  schedule: ScheduleView | undefined;
  removing: boolean;
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const keep = (updated: Widget) =>
    queryClient.setQueryData<Widget[]>(
      ['workspace', 'widgets', widget.board],
      (all) => all?.map((w) => (w.id === updated.id ? updated : w)),
    );
  const refresh = useMutation({
    mutationFn: () => refreshWidget(widget),
    onSuccess: keep,
  });

  // Renaming: the heading becomes a text field until it is saved or cancelled.
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (title: string) => renameWidget(widget, title),
    onSuccess: (updated) => {
      keep(updated);
      setDraft(null);
    },
  });
  const saveTitle = () => {
    const title = draft?.trim();
    if (!title || title === widget.title) {
      setDraft(null);
      rename.reset();
    } else rename.mutate(title);
  };
  const cancelRename = () => {
    setDraft(null);
    rename.reset();
  };

  const chart = asChart(widget.chart);

  // The card takes a third, half or the whole row, by what its data is shown as.
  const size = useMemo(
    () =>
      widget.result
        ? chartSize(chooseChart(widget.result, { chosen: chart }))
        : 'medium',
    [widget.result, chart],
  );

  const [scheduling, setScheduling] = useState(false);
  const [sharing, setSharing] = useState(false);
  const card = useRef<HTMLLIElement>(null);
  const grip = useRef<HTMLButtonElement>(null);

  return (
    <li
      ref={card}
      className={`panel bw-card bw-${size}${drag.dragging ? ' is-dragging' : ''}${drag.over ? ' is-drop-target' : ''}`}
      aria-busy={refresh.isPending}
      onDragOver={(e) => {
        // Only a card's grip, not files or text dragged in from elsewhere.
        if (!drag.active) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        drag.onOver();
      }}
      onDrop={(e) => {
        if (!drag.active) return;
        e.preventDefault();
        drag.onDrop();
      }}
    >
      <header className="bw-head">
        <button
          ref={grip}
          type="button"
          className="bw-grip"
          draggable
          aria-label={`Move ${widget.title}`}
          title="Drag to move this widget, or focus here and use the arrow keys"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', widget.id);
            if (card.current) e.dataTransfer.setDragImage(card.current, 24, 24);
            drag.onStart();
          }}
          onDragEnd={drag.onEnd}
          onKeyDown={(e) => {
            const step =
              e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                ? -1
                : e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : 0;
            if (!step) return;
            e.preventDefault();
            drag.onStep(step);
            // The card moves in the page; keep the grip focused for the next step.
            requestAnimationFrame(() => grip.current?.focus());
          }}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <div className="bw-title">
          {draft === null ? (
            <h3 title={`Question: ${widget.question}`}>{widget.title}</h3>
          ) : (
            <form
              className="bw-rename"
              onSubmit={(e) => {
                e.preventDefault();
                saveTitle();
              }}
            >
              <input
                type="text"
                aria-label="Widget title"
                value={draft}
                maxLength={MAX_TITLE}
                autoFocus
                disabled={rename.isPending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelRename();
                }}
              />
              <button
                type="submit"
                className="td-action"
                aria-label="Save title"
                title="Save"
                disabled={rename.isPending || !draft.trim()}
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="td-action"
                aria-label="Cancel renaming"
                title="Cancel"
                disabled={rename.isPending}
                onClick={cancelRename}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </form>
          )}
          {rename.error && (
            <p className="ia-error" role="alert">
              Couldn't rename: {rename.error.message}
            </p>
          )}
          <DataStatus widget={widget} />
        </div>
        <div className="bw-buttons">
          {draft === null && (
            <button
              type="button"
              className="td-action"
              aria-label={`Rename ${widget.title}`}
              title="Rename: change the heading on this widget"
              onClick={() => setDraft(widget.title)}
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
          )}
          <a
            className="td-action"
            href={widgetPagePath(widget)}
            target="_blank"
            rel="noopener"
            aria-label={`Open ${widget.title} in a new tab`}
            title="Open in a new tab: the full page, with the data and answer details"
          >
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="td-action"
            aria-haspopup="dialog"
            aria-label={`Share ${widget.title}`}
            title="Share: a link to this insight, with its data and answer details"
            onClick={() => setSharing(true)}
          >
            <Share2 size={15} aria-hidden="true" />
          </button>
          {canSchedule && (
            <button
              type="button"
              className={`td-action${schedule ? ' bw-scheduled' : ''}`}
              aria-label={
                schedule
                  ? `Edit the schedule for ${widget.title}`
                  : `Schedule ${widget.title}`
              }
              title={
                schedule
                  ? `Scheduled: ${describeSchedule(schedule.schedule)}. Click to edit.`
                  : 'Schedule: refresh this widget on its own'
              }
              onClick={() => setScheduling(true)}
            >
              <CalendarClock size={15} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="td-action"
            aria-label={`Refresh ${widget.title}`}
            title={
              refresh.isPending
                ? 'Fetching the latest data…'
                : 'Refresh: fetch the latest data from the database'
            }
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={refresh.isPending ? 'bw-spin' : undefined}
            />
          </button>
          <button
            type="button"
            className="td-action"
            aria-label={`Remove ${widget.title}`}
            title="Remove from board"
            disabled={removing || refresh.isPending}
            onClick={onRemove}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      {schedule && <ScheduleStatus view={schedule} />}
      {refresh.isPending && (
        <p className="bw-refreshing" role="status">
          Fetching the latest data from the database…
        </p>
      )}
      {refresh.error && (
        <p className="ia-error" role="alert">
          Couldn't refresh: {refresh.error.message}
        </p>
      )}
      {/* A widget that can't be drawn says so; the rest of the board still shows. */}
      <ErrorBoundary compact resetKey={widget.fetchedAt ?? undefined}>
        {widget.answer && <Prose markdown={widget.answer} />}
        {widget.result && <ResultVisual result={widget.result} chart={chart} />}
      </ErrorBoundary>
      {scheduling && (
        <ScheduleDialog
          question={widget.question}
          answer={widget.answer}
          board={widget.board}
          existing={schedule?.schedule}
          onClose={() => setScheduling(false)}
        />
      )}
      {sharing && (
        <ShareDialog widget={widget} onClose={() => setSharing(false)} />
      )}
    </li>
  );
}
