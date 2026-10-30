import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  createSchedule,
  describeSchedule,
  updateSchedule,
  type Board,
  type Frequency,
  type Schedule,
  type ScheduleInput,
  type ScheduleView,
} from '../../../platform/api/workspaceService';

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
];

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Today in the browser's time zone, as yyyy-MM-dd. */
const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * Define (or edit) when a question runs again. Saves through the workspace in Insights.Gateway; schedules are
 * kept and listed on Scheduled insights, but not run yet.
 */
export function ScheduleDialog({
  question,
  answer,
  board,
  existing,
  onClose,
  onSaved,
}: {
  question: string;
  answer?: string | null;
  board?: Board | null;
  /** Editing this schedule instead of creating one. */
  existing?: Schedule;
  onClose: () => void;
  onSaved?: (saved: ScheduleView) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [name, setName] = useState(
    existing?.name ??
      (question.length > 80 ? `${question.slice(0, 79)}…` : question),
  );
  const [frequency, setFrequency] = useState<Frequency>(
    existing?.frequency ?? 'weekly',
  );
  const [dayOfWeek, setDayOfWeek] = useState(existing?.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(existing?.dayOfMonth ?? 1);
  const [time, setTime] = useState(existing?.time ?? '08:00');
  const [startsOn, setStartsOn] = useState(existing?.startsOn ?? today());

  const input: ScheduleInput = {
    name: name.trim(),
    question,
    frequency,
    time,
    startsOn,
    dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
    dayOfMonth:
      frequency === 'monthly' || frequency === 'quarterly' ? dayOfMonth : null,
    enabled: existing?.enabled ?? true,
    board: board ?? existing?.board ?? null,
    answer: answer ?? existing?.answer ?? null,
  };
  const problem = !input.name
    ? 'Give the schedule a name.'
    : !/^\d{2}:\d{2}$/.test(time)
      ? 'Choose a time.'
      : !startsOn
        ? 'Choose a start date.'
        : null;

  const save = useMutation({
    mutationFn: () =>
      existing ? updateSchedule(existing.id, input) : createSchedule(input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'schedules'],
      });
      onSaved?.(saved);
      onClose();
    },
  });

  // Focus the first field on open, keep the page behind still, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!save.isPending) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [
      ...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem && !save.isPending) save.mutate();
  };

  return (
    <div
      className="rv-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !save.isPending) onClose();
      }}
    >
      <div
        ref={dialog}
        className="rv-modal sd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <form onSubmit={submit} noValidate>
          <div className="rv-head">
            <div>
              <h2 id={titleId}>
                {existing ? 'Edit schedule' : 'Schedule this'}
              </h2>
              <p className="rv-table">{question}</p>
            </div>
            <button
              type="button"
              className="rv-close"
              aria-label="Close"
              disabled={save.isPending}
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="rv-body">
            <label className="rv-field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <fieldset className="rv-field">
              <legend>How often</legend>
              <div className="sd-frequencies">
                {FREQUENCIES.map((option) => (
                  <label
                    key={option.value}
                    className={
                      'sd-frequency' +
                      (frequency === option.value ? ' is-selected' : '')
                    }
                  >
                    <input
                      type="radio"
                      name="schedule-frequency"
                      value={option.value}
                      checked={frequency === option.value}
                      onChange={() => setFrequency(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="sd-row">
              {frequency === 'weekly' && (
                <label className="rv-field">
                  <span>On</span>
                  <select
                    value={dayOfWeek}
                    onChange={(event) =>
                      setDayOfWeek(Number(event.target.value))
                    }
                  >
                    {WEEKDAYS.map((day, i) => (
                      <option key={day} value={i}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(frequency === 'monthly' || frequency === 'quarterly') && (
                <label className="rv-field">
                  <span>Day of the month</span>
                  <select
                    value={dayOfMonth}
                    onChange={(event) =>
                      setDayOfMonth(Number(event.target.value))
                    }
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="rv-field">
                <span>Time</span>
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
              <label className="rv-field">
                <span>Starts on</span>
                <input
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                />
              </label>
            </div>

            <p className="rv-note">
              <strong>{describeSchedule(input)}</strong>. The schedule is saved
              and listed on Scheduled Insights; running it automatically is
              coming soon.
            </p>
            {save.error && (
              <p className="rv-error" role="alert">
                {save.error.message}
              </p>
            )}
          </div>

          <div className="rv-foot">
            <span className="rv-problem" aria-live="polite">
              {problem}
            </span>
            <button
              type="button"
              className="td-action"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="td-action td-action-primary"
              disabled={Boolean(problem) || save.isPending}
            >
              {save.isPending
                ? 'Saving…'
                : existing
                  ? 'Save changes'
                  : 'Save schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
