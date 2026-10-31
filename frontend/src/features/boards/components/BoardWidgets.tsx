import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  CalendarClock,
  Check,
  Database,
  Ellipsis,
  ExternalLink,
  GripVertical,
  LayoutDashboard,
  MessageSquare,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
  X,
  type LucideIcon,
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
 * How fresh a widget's data is: how long ago its rows were last read from the database, with the
 * date and time on hover. Refresh reads them again.
 */
function DataStatus({ widget }: { widget: Widget }) {
  // Widgets saved before the fetch time was recorded: the data was read just before adding.
  const fetched = widget.fetchedAt ?? widget.createdAt;
  return (
    <p className="bw-synced">
      <Database size={13} aria-hidden="true" />
      <span>
        Synced{' '}
        <time dateTime={fetched} title={`Data synced ${formatWhen(fetched)}`}>
          {ageOf(fetched)}
        </time>
      </span>
    </p>
  );
}

/** One action in a card's ⋯ menu. */
interface MenuAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Set apart at the foot of the menu, in red. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A card's ⋯ menu: the actions used less often than Refresh and Open. It closes on a choice, on
 * Escape (back to its button) or on a click elsewhere; the arrow keys move between its items.
 */
function WidgetMenu({ label, items }: { label: string; items: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const enabledItems = () => [
    ...(root.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    ) ?? []),
  ];

  useEffect(() => {
    if (!open) return;
    enabledItems()[0]?.focus();
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const move = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const list = enabledItems();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % list.length
        : e.key === 'ArrowUp'
          ? (at - 1 + list.length) % list.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? list.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div className="bw-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="bw-icon"
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <Ellipsis size={16} strokeWidth={2.75} aria-hidden="true" />
      </button>
      {open && (
        <ul
          className="bw-menu-list"
          role="menu"
          id={menuId}
          aria-label={label}
          onKeyDown={move}
        >
          {items.map(({ label, icon: Icon, onSelect, danger, disabled }) => (
            <li
              key={label}
              role="none"
              className={danger ? 'bw-menu-danger' : undefined}
            >
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onSelect();
                }}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A widget's answer: its first three lines, with Read more when there is more. The widget's own
 * page always shows it all.
 */
function AnswerText({ markdown }: { markdown: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  // Whether the text runs past three lines, measured again as the card's width changes.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [markdown, expanded]);

  return (
    <div className="bw-answer">
      <div
        ref={box}
        id={id}
        className={
          expanded ? undefined : `is-clamped${overflows ? ' is-faded' : ''}`
        }
      >
        <Prose markdown={markdown} />
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          className="bw-more"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
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
 * One widget, with a grip to move it, buttons to refresh its data from the database and open its
 * page, and a ⋯ menu to rename, share, schedule or remove it.
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
            <h3 title={`${widget.title}\nQuestion: ${widget.question}`}>
              {widget.title}
            </h3>
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
                className="bw-icon"
                aria-label="Save title"
                title="Save"
                disabled={rename.isPending || !draft.trim()}
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="bw-icon"
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
        {/* While renaming, the title field takes the whole row. */}
        {draft === null && (
          <div className="bw-buttons">
            <button
              type="button"
              className="bw-icon"
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
                size={16}
                aria-hidden="true"
                className={refresh.isPending ? 'bw-spin' : undefined}
              />
            </button>
            <a
              className="bw-icon"
              href={widgetPagePath(widget)}
              target="_blank"
              rel="noopener"
              aria-label={`Open ${widget.title} in a new tab`}
              title="Open in a new tab: the full page, with the data and answer details"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
            <WidgetMenu
              label={`More actions for ${widget.title}`}
              items={[
                {
                  label: 'Rename',
                  icon: Pencil,
                  onSelect: () => setDraft(widget.title),
                },
                {
                  label: 'Share',
                  icon: Share2,
                  onSelect: () => setSharing(true),
                },
                ...(canSchedule
                  ? [
                      {
                        label: schedule ? 'Edit schedule' : 'Schedule',
                        icon: CalendarClock,
                        onSelect: () => setScheduling(true),
                      },
                    ]
                  : []),
                {
                  label: 'Remove',
                  icon: Trash2,
                  danger: true,
                  disabled: removing || refresh.isPending,
                  onSelect: onRemove,
                },
              ]}
            />
          </div>
        )}
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
        {widget.answer && <AnswerText markdown={widget.answer} />}
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
