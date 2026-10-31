import { useQuery } from '@tanstack/react-query';
import { Info, Lightbulb, RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  canRecommend,
  loadRecommendations,
  type AssistantReply,
} from '../services/assistantService';

const TITLE = 'Recommended actions';

/** What the backend is doing, in turn: the baseline query, then the AI's actions. */
const WORKING_LINES = [
  'Comparing with the chain average…',
  'Looking for the biggest gaps…',
  'Writing recommended actions…',
];
const WORKING_MS = 4000;

/**
 * Up to three things to do about an answer about the data: Analytics sets the rows against a
 * benchmark, then AI Hub suggests actions from the gaps. They load on their own after the answer
 * is shown, so they never hold it up. The panel shows while they load, says so when the rows call
 * for nothing, and offers to try again when the call fails. A note about the data itself (such as
 * a partial last day) is shown under the actions.
 */
export function Recommendations({ reply }: { reply: AssistantReply }) {
  const analytics = reply.intent === 'analytics' ? reply.result : null;
  const enabled = canRecommend(reply);
  const query = useQuery({
    // The rows themselves are too big for a key: the query and when it ran stand for them.
    queryKey: [
      'assistant',
      'recommendations',
      reply.question,
      analytics?.sql,
      analytics?.fetchedAt,
    ],
    queryFn: () => loadRecommendations(reply),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
  if (!enabled) return null;
  if (query.isPending)
    return (
      <Panel>
        <Working />
        <div className="ia-rec-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      </Panel>
    );
  if (query.isError)
    return (
      <Panel>
        <div className="ia-rec-failed" role="alert">
          <p>Couldn't work out recommended actions for this answer.</p>
          <button
            type="button"
            className="td-action"
            onClick={() => void query.refetch()}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Try again
          </button>
        </div>
      </Panel>
    );
  const { recommendations, dataNote } = query.data;
  return (
    <Panel>
      {recommendations.length > 0 ? (
        <ul>
          {recommendations.map((rec, i) => (
            <li key={i} className="ia-rec">
              <span className={`ia-rec-priority is-${rec.priority}`}>
                {rec.priority}
              </span>
              <div className="ia-rec-body">
                <p className="ia-rec-action">{rec.action}</p>
                <p className="ia-rec-why">{rec.why}</p>
              </div>
              <span className="ia-rec-owner">{rec.owner}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ia-rec-none">
          No clear actions: nothing here stands far from the chain average.
        </p>
      )}
      {dataNote && (
        <p className="ia-rec-note">
          <Info size={14} aria-hidden="true" />
          {dataNote}
        </p>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="ia-recs" aria-label={TITLE}>
      <h2 className="ia-label ia-recs-title">
        <Lightbulb size={15} aria-hidden="true" />
        {TITLE}
      </h2>
      {children}
    </section>
  );
}

/**
 * The spinner and a line that moves on every few seconds, then stays on the last one so a slow
 * reply never looks like it started over. Screen readers hear it once.
 */
function Working() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (line >= WORKING_LINES.length - 1) return;
    const timer = window.setTimeout(() => setLine(line + 1), WORKING_MS);
    return () => window.clearTimeout(timer);
  }, [line]);
  return (
    <p
      className="ia-thinking ia-rec-working"
      role="status"
      aria-label="Finding recommended actions"
    >
      <span className="spinner" aria-hidden="true" />
      <span aria-hidden="true">{WORKING_LINES[line]}</span>
    </p>
  );
}
