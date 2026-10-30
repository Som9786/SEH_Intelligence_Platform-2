import { ArrowRight, Compass, RotateCcw, Send, SquarePen } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { PageHeading } from '../../../shared/components/PageHeading';
import { AnswerActions } from '../components/AnswerActions';
import { AssistantAnswer } from '../components/AssistantAnswer';
import { ExploreQuestions } from '../components/ExploreQuestions';
import { FollowUps } from '../components/FollowUps';
import { useSuggestedQuestions } from '../hooks/useSuggestedQuestions';
import { useAuth } from '../../auth/useAuth';
import {
  askAssistant,
  interleave,
  MAX_QUESTION_LENGTH,
  turnOf,
} from '../services/assistantService';
import { loadThread, saveThread, type Exchange } from '../services/threadStore';

/** Earlier answers sent with each question, so follow-ups are understood. */
const MAX_HISTORY = 6;

/**
 * Shown in turn while an answer is on its way: plain words that fit any question, about the data
 * or the database, since which it is isn't known until the answer comes back.
 */
const THINKING_LINES = [
  'Reading your question…',
  'Finding the right information…',
  'Checking the details…',
  'Putting it together…',
  'Writing your answer…',
];
const THINKING_MS = 2000;

/**
 * The spinner and a line that moves on every couple of seconds, then stays on the last one so a
 * slow answer never looks like it started over. Screen readers hear it once.
 */
function Thinking() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (line >= THINKING_LINES.length - 1) return;
    const timer = window.setTimeout(() => setLine(line + 1), THINKING_MS);
    return () => window.clearTimeout(timer);
  }, [line]);
  return (
    <p className="ia-thinking" role="status" aria-label="Finding your answer">
      <span className="spinner" aria-hidden="true" />
      <span aria-hidden="true">{THINKING_LINES[line]}</span>
    </p>
  );
}

/**
 * Insights Assistant: ask a question in plain English. AI Hub works out whether it's about the
 * sales data (answered by Analytics with a query) or the database's structure (answered by DB
 * Guide from the catalog), and asks that service.
 */
export function AiAssistantPage() {
  const [params, setParams] = useSearchParams();
  const suggestions = useSuggestedQuestions();
  const username = useAuth().user?.username ?? '';
  // The conversation so far, kept for this tab so it's still here when the user comes back.
  const [exchanges, setExchanges] = useState<Exchange[]>(() =>
    username ? loadThread(username) : [],
  );
  useEffect(() => {
    if (username) saveThread(username, exchanges);
  }, [username, exchanges]);
  const [draft, setDraft] = useState('');
  const [exploring, setExploring] = useState(false);
  const latest = useRef<HTMLElement>(null);
  const thinking = exchanges.some((exchange) => exchange.status === 'pending');
  // Screen readers hear that the answer arrived, not the whole card; they can then read it at
  // their own pace. Errors are announced by their own alert.
  const [announced, setAnnounced] = useState('');
  const wasThinking = useRef(false);
  useEffect(() => {
    const last = exchanges[exchanges.length - 1];
    if (wasThinking.current && !thinking && last?.status === 'done')
      setAnnounced(`Answer ready: ${last.question}`);
    wasThinking.current = thinking;
  }, [thinking, exchanges]);

  // A new question scrolls to the top of the screen, so its progress and then its answer show
  // below it and read from the start. The answer arriving doesn't scroll. Coming back to a saved
  // thread jumps to its latest question without animating through the whole thread.
  const scrolled = useRef(false);
  useEffect(() => {
    if (exchanges.length === 0) return;
    latest.current?.scrollIntoView?.({
      block: 'start',
      behavior: scrolled.current ? 'smooth' : 'auto',
    });
    scrolled.current = true;
  }, [exchanges.length]);

  const run = (question: string, earlier: Exchange[]) => {
    const history = earlier
      .flatMap((exchange) =>
        exchange.status === 'done' ? [turnOf(exchange.reply)] : [],
      )
      .slice(-MAX_HISTORY);
    const settle = (next: Exchange) =>
      setExchanges((all) =>
        all.map((exchange, i) => (i === all.length - 1 ? next : exchange)),
      );
    askAssistant(question, history)
      .then((reply) => settle({ question, status: 'done', reply }))
      .catch((error: unknown) =>
        settle({
          question,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'The question could not be answered.',
        }),
      );
  };

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || thinking) return;
    setDraft('');
    setExchanges([...exchanges, { question: text, status: 'pending' }]);
    run(text, exchanges);
  };

  const retry = () => {
    const last = exchanges.at(-1);
    if (thinking || !last || last.status !== 'error') return;
    const earlier = exchanges.slice(0, -1);
    setExchanges([...earlier, { question: last.question, status: 'pending' }]);
    run(last.question, earlier);
  };

  // A question from the link (`?q=`, e.g. asked on the Overview page) is asked at once, and only
  // once even when React runs effects twice in development. It then leaves the address, so a reload
  // or Back doesn't ask it again.
  const initialQuestion = (params.get('q') ?? '').trim();
  const askedInitial = useRef(false);
  useEffect(() => {
    if (askedInitial.current || !initialQuestion) return;
    askedInitial.current = true;
    ask(initialQuestion);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once, on arrival
  }, [initialQuestion]);

  // Start over: the next question is asked without the earlier ones as context.
  const newThread = () => {
    if (thinking) return;
    setExchanges([]);
    setDraft('');
    if (params.has('q')) setParams({}, { replace: true });
    window.scrollTo?.({ top: 0 });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  const startQuestions = interleave(suggestions, 6);

  return (
    <div className="page-content ia-page">
      <PageHeading
        title="Insights Assistant"
        description="Ask questions to explore sales trends, store performance, customer baskets, and how your data is organised."
      />
      <p className="td-sr-only" role="status">
        {announced}
      </p>
      <div className="ia-thread">
        {exchanges.length === 0 && (
          <section className="ia-welcome" aria-labelledby="ia-welcome-title">
            <h2 id="ia-welcome-title">What would you like to know?</h2>
            {startQuestions.length > 0 && (
              <ul aria-label="Suggested questions">
                {startQuestions.map((question) => (
                  <li key={question}>
                    <button type="button" onClick={() => ask(question)}>
                      {question}
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {exchanges.map((exchange, i) => (
          <article
            className="ia-exchange"
            key={i}
            ref={i === exchanges.length - 1 ? latest : undefined}
          >
            <p className="ia-question">{exchange.question}</p>
            {exchange.status === 'pending' && <Thinking />}
            {exchange.status === 'done' && (
              <>
                {/* One card per answer, with its actions, so answers stand apart. */}
                <div className="ia-card">
                  <ErrorBoundary compact>
                    <AssistantAnswer reply={exchange.reply} />
                  </ErrorBoundary>
                  <AnswerActions
                    reply={exchange.reply}
                    kept={exchange.kept}
                    onKept={(change) =>
                      setExchanges((all) =>
                        all.map((e, j) =>
                          j === i && e.status === 'done'
                            ? { ...e, kept: { ...e.kept, ...change } }
                            : e,
                        ),
                      )
                    }
                  />
                </div>
                {/* Only the latest answer suggests what to ask next. */}
                {i === exchanges.length - 1 && (
                  <FollowUps
                    reply={exchange.reply}
                    disabled={thinking}
                    onAsk={ask}
                  />
                )}
              </>
            )}
            {exchange.status === 'error' && (
              <div className="ia-error" role="alert">
                <p>{exchange.error}</p>
                {i === exchanges.length - 1 && (
                  <button
                    type="button"
                    className="td-action"
                    onClick={retry}
                    disabled={thinking}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    Try again
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="ia-composer">
        <form className="po-ask" onSubmit={submit}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about sales, stores, items, or the database’s tables…"
            maxLength={MAX_QUESTION_LENGTH}
            aria-label="Ask Insights Assistant"
          />
          {exchanges.length > 0 && (
            <button
              className="td-action"
              type="button"
              aria-label="New thread"
              disabled={thinking}
              title={
                thinking
                  ? 'Wait for the answer, then start a new thread'
                  : 'New thread: clear this conversation and start a new one'
              }
              onClick={newThread}
            >
              <SquarePen size={16} aria-hidden="true" />
              <span className="ia-explore-label">New thread</span>
            </button>
          )}
          <button
            className="td-action"
            type="button"
            aria-haspopup="dialog"
            aria-label="Explore questions"
            title="Explore questions"
            onClick={() => setExploring(true)}
          >
            <Compass size={16} aria-hidden="true" />
            {/* Icon only on narrow screens. */}
            <span className="ia-explore-label">Explore questions</span>
          </button>
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
      {exploring && (
        <ExploreQuestions
          questions={suggestions}
          disabled={thinking}
          onAsk={ask}
          onClose={() => setExploring(false)}
        />
      )}
    </div>
  );
}
