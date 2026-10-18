import { ArrowRight, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { ResourceState } from '../../table-details/components/ResourceState';
import { useRelationshipIndex } from '../../table-details/hooks/useRelationshipIndex';
import {
  scriptedReply,
  suggestedQuestions,
  type Reply,
} from '../utils/scriptedAnswers';

interface Message {
  from: 'assistant' | 'user';
  reply: Reply;
}

const GREETING: Message = {
  from: 'assistant',
  reply: {
    paragraphs: [
      'Hi! I can help explain table keys and relationships in this database. Select a suggested question or ask your own.',
      'This is a preview with scripted answers. No AI model or live database is connected yet.',
    ],
  },
};
const REPLY_DELAY_MS = 450;
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function AiAssistantPage() {
  const [params, setParams] = useSearchParams();
  const demo = params.get('demo') === '1';

  return (
    <div className="page-content">
      <PageHeading
        title="AI Assistant"
        description="Ask questions in plain English about tables, keys, and relationships."
        badge={
          <div className="td-actions">
            <button
              type="button"
              className="td-action td-action-primary"
              onClick={() => setParams(demo ? {} : { demo: '1' })}
            >
              <Sparkles size={16} aria-hidden="true" />
              {demo ? 'Close preview' : 'Preview the assistant'}
            </button>
          </div>
        }
      />
      {demo ? (
        <Demo />
      ) : (
        <section
          className="placeholder-panel"
          aria-label="AI Assistant coming soon"
        >
          <div className="placeholder-icon">
            <Sparkles size={30} aria-hidden="true" />
          </div>
          <p className="eyebrow">Coming soon</p>
          <h2>AI Assistant</h2>
          <p>
            An assistant for exploring database knowledge is planned. Use
            Preview the assistant above to see how it will look once built,
            with scripted answers based on this catalog.
          </p>
        </section>
      )}
    </div>
  );
}

function Demo() {
  const index = useRelationshipIndex();
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, thinking]);

  if (index.isPending)
    return <ResourceState kind="loading" title="Loading the catalog" />;
  if (index.isError || !index.data)
    return (
      <ResourceState
        kind="error"
        title="The catalog could not be loaded."
        onRetry={() => void index.refetch()}
      />
    );
  const catalog = index.data;

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || thinking) return;
    setMessages((all) => [
      ...all,
      { from: 'user', reply: { paragraphs: [text] } },
    ]);
    setDraft('');
    setThinking(true);
    timer.current = window.setTimeout(() => {
      setMessages((all) => [
        ...all,
        { from: 'assistant', reply: scriptedReply(text, catalog) },
      ]);
      setThinking(false);
    }, REPLY_DELAY_MS);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <div className="ai-layout">
      <section className="ai-chat" aria-label="SEH Atlas">
        <header className="ai-chat-head">
          <span className="ai-avatar ai-avatar-lg" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <div>
            <h2>SEH Atlas</h2>
            <p>
              Context: {plural(catalog.tables.size, 'table', 'tables')} ·{' '}
              {plural(catalog.edges.length, 'relationship', 'relationships')} ·
              metadata only
            </p>
          </div>
          <ul className="td-badge-row ai-chips" aria-label="Preview status">
            <li className="td-chip td-chip-columns">Scripted answers</li>
            <li className="td-chip td-chip-columns">Read only</li>
          </ul>
        </header>
        <div className="ai-messages" role="log" aria-live="polite">
          {messages.map((message, i) => (
            <div className={`ai-message ai-${message.from}`} key={i}>
              {message.from === 'assistant' && (
                <span className="ai-avatar" aria-hidden="true">
                  <Sparkles size={14} />
                </span>
              )}
              <div className="ai-bubble">
                {message.reply.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
                {message.reply.code && <pre>{message.reply.code}</pre>}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="ai-message ai-assistant" role="status">
              <span className="ai-avatar" aria-hidden="true">
                <Sparkles size={14} />
              </span>
              <div className="ai-bubble ai-thinking">Thinking…</div>
            </div>
          )}
          <div ref={end} />
        </div>
        <form className="ai-input-row" onSubmit={submit}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about a table or relationship…"
            aria-label="Ask about a table or relationship"
          />
          <button
            className="button button-primary ai-send"
            type="submit"
            aria-label="Send question"
            disabled={!draft.trim() || thinking}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
        <p className="ai-footnote">
          Preview only. Replies are scripted from the catalog.
        </p>
      </section>
      <aside className="ai-side">
        <section className="ai-suggested" aria-labelledby="ai-suggested-title">
          <h2 id="ai-suggested-title">Suggested questions</h2>
          <p>Try one of these schema-oriented prompts.</p>
          <ul>
            {suggestedQuestions(catalog).map((question) => (
              <li key={question}>
                <button type="button" onClick={() => ask(question)}>
                  <span>{question}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="ai-boundary" aria-labelledby="ai-boundary-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2 id="ai-boundary-title">Data boundary</h2>
          <p>
            <strong>Now:</strong> scripted answers from the catalog files (table
            names, keys and relationships). No business data, AI model or SQL.
          </p>
          <p>
            <strong>Once built:</strong> an AI model will answer from the same
            catalog metadata, never from row-level business data.
          </p>
        </section>
      </aside>
    </div>
  );
}
