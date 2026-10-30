import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AssistantReply } from '../services/assistantService';
import {
  analyticsDetails,
  dbGuideDetails,
  type AnswerDetails,
} from '../utils/answerDetails';
import { ResultVisual } from './ResultVisual';

const SERVICE_LABEL = {
  analytics: 'Basket Analysis',
  'db-guide': 'DB Copilot',
} as const;

/** An answer's text: Markdown, without raw HTML. Also used by board widgets. */
export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="ia-markdown">
      <Markdown skipHtml remarkPlugins={[remarkGfm]}>
        {markdown}
      </Markdown>
    </div>
  );
}

/** "How I reached this": the numbered steps behind an answer. Also on an insight's page. */
export function Steps({ steps }: { steps: string[] }) {
  if (!steps.length) return null;
  return (
    <section aria-label="How I reached this">
      <h2 className="ia-label">How I reached this</h2>
      <ol className="ia-steps">
        {steps.map((step, i) => (
          <li key={i}>
            <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** How far to trust an answer, and why. Also on an insight's page. */
export function Confidence({
  confidence,
}: {
  confidence: AnswerDetails['confidence'];
}) {
  return (
    <p className="ia-confidence">
      <span
        className={`ia-confidence-level is-${confidence.level.toLowerCase()}`}
      >
        {confidence.level} confidence
      </span>
      {confidence.note}
    </p>
  );
}

/**
 * A reply from Insights Assistant: where it was routed, the answer, how it was reached, the result
 * (as bars when they suit, otherwise as a table) and how far to trust it. Sources and definitions
 * open from AnswerActions (Data behind this).
 */
export function AssistantAnswer({ reply }: { reply: AssistantReply }) {
  if (reply.intent === 'unclear')
    return (
      <div className="ia-answer">
        {reply.message && <p className="ia-summary">{reply.message}</p>}
      </div>
    );

  const details =
    reply.intent === 'analytics'
      ? analyticsDetails(reply.result)
      : dbGuideDetails(reply.result);
  const text = reply.result.answer;
  return (
    <div className="ia-answer">
      <p className="ia-route">Routed to · {SERVICE_LABEL[reply.service]}</p>
      {!details ? (
        // Analytics can't answer from the data: say why.
        <p className="ia-summary">
          {(reply.intent === 'analytics' && reply.result.explanation) ||
            "This question can't be answered from the sales data."}
        </p>
      ) : (
        <>
          {text && <Prose markdown={text} />}
          <Steps steps={details.steps} />
          {reply.intent === 'analytics' && reply.result.result && (
            <ResultVisual result={reply.result.result} />
          )}
          <Confidence confidence={details.confidence} />
        </>
      )}
    </div>
  );
}
