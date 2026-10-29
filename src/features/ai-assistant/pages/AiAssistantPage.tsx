import { ArrowRight, Info, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { useRelationshipIndex } from '../../table-details/hooks/useRelationshipIndex';
import {
  answerQuestion,
  SUGGESTED_QUESTIONS,
  type InsightAnswer,
} from '../utils/insightAnswers';

interface Exchange {
  question: string;
  answer: InsightAnswer | null; // null while the reply is on its way
}

const REPLY_DELAY_MS = 450;
/** The welcome list leaves out the Store 124 follow-up; it reads better after a waste answer. */
const START_QUESTIONS = SUGGESTED_QUESTIONS.filter((q) => !q.includes('124'));
const formatValue = (value: number, unit: '%' | '$K' | 'stores') =>
  unit === '%'
    ? `${value.toFixed(1)}%`
    : unit === '$K'
      ? `$${value.toFixed(1)}K`
      : String(value);

/** Insights Assistant preview: ask a question, get a sample answer with its reasoning and sources. */
export function AiAssistantPage() {
  const [params] = useSearchParams();
  const index = useRelationshipIndex();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);
  const thinking = exchanges.some((exchange) => exchange.answer === null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [exchanges]);

  // A question from the link (`?q=`, e.g. asked on the Overview page) is answered at once, so it
  // runs only once even when React runs effects twice in development.
  const initialQuestion = (params.get('q') ?? '').trim();
  const askedInitial = useRef(false);
  useEffect(() => {
    if (askedInitial.current || !initialQuestion) return;
    askedInitial.current = true;
    setExchanges([
      {
        question: initialQuestion,
        answer: answerQuestion(initialQuestion, index.data),
      },
    ]);
  }, [initialQuestion, index.data]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || thinking) return;
    setExchanges((all) => [...all, { question: text, answer: null }]);
    setDraft('');
    timer.current = window.setTimeout(() => {
      const answer = answerQuestion(text, index.data);
      setExchanges((all) =>
        all.map((exchange, i) =>
          i === all.length - 1 ? { ...exchange, answer } : exchange,
        ),
      );
    }, REPLY_DELAY_MS);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <div className="page-content ia-page">
      <PageHeading
        title="Insights Assistant"
        description="Explore what changed, understand why, and ask follow-up questions."
        badge={
          <p className="ia-sample-note">
            <Info size={14} aria-hidden="true" />
            Preview with sample answers. Numbers are illustrative, not live
            store data.
          </p>
        }
      />
      <div className="ia-thread" role="log" aria-live="polite">
        {exchanges.length === 0 && (
          <section className="ia-welcome" aria-labelledby="ia-welcome-title">
            <h2 id="ia-welcome-title">What would you like to understand?</h2>
            <p>
              Pick a question or ask your own. Scheduling an answer to run again
              weekly, monthly or quarterly is coming soon.
            </p>
            <ul aria-label="Suggested questions">
              {START_QUESTIONS.map((question, i) => (
                <li key={question}>
                  <button
                    type="button"
                    className={i === 0 ? 'is-featured' : undefined}
                    onClick={() => ask(question)}
                  >
                    {question}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {exchanges.map((exchange, i) => (
          <article className="ia-exchange" key={i}>
            <p className="ia-question">{exchange.question}</p>
            {exchange.answer ? (
              <Answer answer={exchange.answer} />
            ) : (
              <p className="ia-thinking" role="status">
                Thinking…
              </p>
            )}
          </article>
        ))}
        <div ref={end} />
      </div>
      <div className="ia-composer">
        {exchanges.length > 0 && (
          <ul className="ia-suggestions" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  disabled={thinking}
                  onClick={() => ask(question)}
                >
                  {question}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="po-ask" onSubmit={submit}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about any store, item, date or insight…"
            aria-label="Ask Insights Assistant"
          />
          <button
            className="td-action td-action-primary"
            type="submit"
            disabled={!draft.trim() || thinking}
          >
            Ask
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Answer({ answer }: { answer: InsightAnswer }) {
  const { chart } = answer;
  const max = chart ? Math.max(...chart.rows.map((row) => row.value)) : 0;
  return (
    <div className="ia-answer">
      <p className="ia-route">Routed to · {answer.route.join(' · ')}</p>
      {answer.summary.map((text) => (
        <p className="ia-summary" key={text}>
          {text}
        </p>
      ))}
      {answer.code && <pre className="ia-code">{answer.code}</pre>}
      {answer.steps && (
        <section aria-label="How I reached this">
          <h2 className="ia-label">How I reached this</h2>
          <ol className="ia-steps">
            {answer.steps.map((step, i) => (
              <li key={step}>
                <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}
      {chart && (
        <figure className="panel ia-chart">
          <figcaption className="ia-label">{chart.title}</figcaption>
          <ul>
            {chart.rows.map((row) => (
              <li
                key={row.label}
                title={`${row.label}: ${formatValue(row.value, chart.unit)}`}
              >
                <span className="ia-chart-label">{row.label}</span>
                <span className="ia-chart-track" aria-hidden="true">
                  <span
                    className="ia-chart-bar"
                    style={{ width: `${(row.value / max) * 100}%` }}
                  />
                </span>
                <strong className="ia-chart-value">
                  {formatValue(row.value, chart.unit)}
                </strong>
              </li>
            ))}
          </ul>
        </figure>
      )}
      {answer.confidence && (
        <p className="ia-confidence">
          <span
            className={`ia-confidence-level is-${answer.confidence.level.toLowerCase()}`}
          >
            {answer.confidence.level} confidence
          </span>
          {answer.confidence.note}
        </p>
      )}
      {answer.dataUsed && (
        <div className="ia-data-used">
          <h2 className="ia-label">Data used</h2>
          <ul className="td-badge-row">
            {answer.dataUsed.map((source) => (
              <li className="td-chip td-chip-columns" key={source}>
                {source}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
