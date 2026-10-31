import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Database, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { ScheduleDialog } from '../../scheduled-insights/components/ScheduleDialog';
import {
  addWidget,
  BOARD_LABEL,
  BOARD_PATH,
  BOARDS_WITH_WIDGETS,
  detailsOf,
  type Board,
} from '../../../platform/api/workspaceService';
import type { AssistantReply } from '../services/assistantService';
import type { KeptActions } from '../services/threadStore';
import { askedOf, chooseChart, type ChartKind } from '../utils/chartChoice';
import { DataBehindThis } from './DataBehindThis';

/**
 * "Schedule this" on an answer. Off for now: questions are scheduled from their widget on a board
 * (the schedule button on each card). Set to true to bring the button back on answers.
 */
const SCHEDULE_FROM_ANSWERS = false;

/**
 * What can be done with an answer: open the data behind it, and for an answer about the data,
 * schedule the question to run again and keep the answer as a widget on the board AI Hub picked.
 * What was done is reported with onKept and comes back as kept, so a saved thread doesn't offer
 * to add the same answer twice. A widget keeps the chart the answer is drawn as, when it was picked
 * or asked for.
 */
export function AnswerActions({
  reply,
  kept,
  onKept,
  chart,
}: {
  reply: AssistantReply;
  kept?: KeptActions;
  onKept?: (change: KeptActions) => void;
  chart?: ChartKind;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [behind, setBehind] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(kept?.scheduled ?? false);
  const add = useMutation({
    mutationFn: addWidget,
    onSuccess: (widget) => {
      onKept?.({ addedTo: widget.board });
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'widgets', widget.board],
      });
    },
  });

  if (reply.intent === 'unclear') return null;
  if (reply.intent === 'analytics' && !reply.result.answerable) return null;

  const dataBehind = (
    <>
      <button
        type="button"
        className="td-action"
        aria-haspopup="dialog"
        onClick={() => setBehind(true)}
      >
        <Database size={16} aria-hidden="true" />
        Data behind this
      </button>
      {behind && (
        <DataBehindThis
          source={
            reply.intent === 'analytics'
              ? {
                  intent: 'analytics',
                  question: reply.question,
                  reason: reply.reason,
                  result: reply.result,
                }
              : {
                  intent: 'db-catalog',
                  question: reply.question,
                  reason: reply.reason,
                  result: reply.result,
                }
          }
          onClose={() => setBehind(false)}
        />
      )}
    </>
  );
  if (reply.intent === 'db-catalog')
    return <div className="ia-actions">{dataBehind}</div>;

  const { result } = reply;
  const board =
    reply.board !== 'none' &&
    BOARDS_WITH_WIDGETS.includes(reply.board) &&
    can(reply.board)
      ? (reply.board as Board)
      : null;
  const canSchedule = SCHEDULE_FROM_ANSWERS && can('scheduled-insights');
  const keptChart = () => {
    if (!result.result) return null;
    const choice = chooseChart(result.result, {
      question: reply.question,
      asked: askedOf(reply.chart),
      chosen: chart,
    });
    return choice.explicit ? choice.chart : null;
  };

  return (
    <div className="ia-actions">
      {dataBehind}
      {canSchedule &&
        (scheduled ? (
          <Link to="/scheduled-insights" className="td-action is-done">
            <Check size={16} aria-hidden="true" />
            Scheduled · View
          </Link>
        ) : (
          <button
            type="button"
            className="td-action"
            onClick={() => setScheduling(true)}
          >
            <CalendarClock size={16} aria-hidden="true" />
            Schedule this
          </button>
        ))}
      {board &&
        (add.isSuccess || kept?.addedTo === board ? (
          <Link to={BOARD_PATH[board]} className="td-action is-done">
            <Check size={16} aria-hidden="true" />
            Added to {BOARD_LABEL[board]} · View
          </Link>
        ) : (
          <button
            type="button"
            className="td-action"
            disabled={add.isPending}
            onClick={() =>
              add.mutate({
                board,
                question: reply.question,
                answer: result.answer,
                result: result.result,
                fetchedAt: result.fetchedAt ?? null,
                details: detailsOf(result),
                chart: keptChart(),
              })
            }
          >
            <LayoutDashboard size={16} aria-hidden="true" />
            {add.isPending ? 'Adding…' : `Add to ${BOARD_LABEL[board]}`}
          </button>
        ))}
      {add.error && (
        <span className="ia-action-error" role="alert">
          {add.error.message}
        </span>
      )}
      {scheduling && (
        <ScheduleDialog
          question={reply.question}
          answer={result.answer}
          board={board}
          onClose={() => setScheduling(false)}
          onSaved={() => {
            setScheduled(true);
            onKept?.({ scheduled: true });
          }}
        />
      )}
    </div>
  );
}
