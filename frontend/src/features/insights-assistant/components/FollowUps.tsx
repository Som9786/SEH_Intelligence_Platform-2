import { useQuery } from '@tanstack/react-query';
import { CornerDownRight, X } from 'lucide-react';
import { useState } from 'react';
import {
  loadFollowUps,
  type AssistantReply,
} from '../services/assistantService';

const TITLE = 'You might also want to know';

/**
 * Up to three questions to ask next, suggested by AI Hub after the answer is shown. They load on
 * their own, so they never hold up the answer, and simply don't appear if the call fails. The
 * user can dismiss them.
 */
export function FollowUps({
  reply,
  disabled,
  onAsk,
}: {
  reply: AssistantReply;
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const query = useQuery({
    queryKey: ['assistant', 'follow-ups', reply.question, reply.intent],
    queryFn: () => loadFollowUps(reply),
    enabled: reply.intent !== 'unclear' && !dismissed,
    staleTime: Infinity,
    retry: false,
  });
  if (reply.intent === 'unclear' || dismissed) return null;
  if (query.isPending)
    return (
      <p className="ia-follow-loading" role="status">
        Finding questions you might ask next…
      </p>
    );
  if (!query.data?.length) return null;
  return (
    <section className="ia-follow-ups" aria-label={TITLE}>
      <div className="ia-follow-head">
        <h2 className="ia-label">{TITLE}</h2>
        <button
          type="button"
          className="ia-follow-close"
          aria-label="Dismiss these questions"
          title="Dismiss"
          onClick={() => setDismissed(true)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <ul>
        {query.data.map((question) => (
          <li key={question}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAsk(question)}
            >
              <CornerDownRight size={15} aria-hidden="true" />
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
