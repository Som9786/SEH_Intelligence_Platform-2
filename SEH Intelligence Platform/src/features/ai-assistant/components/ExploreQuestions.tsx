import { ArrowRight, Search } from 'lucide-react';
import { useState } from 'react';
import type { SuggestedQuestions } from '../services/assistantService';
import { SideFlyout } from '../../../shared/components/SideFlyout';

const GROUPS: { key: keyof SuggestedQuestions; title: string }[] = [
  { key: 'data', title: 'Basket Analysis · sales, stores and baskets' },
  { key: 'structure', title: 'DB Copilot · tables, columns and joins' },
];

/**
 * Every question Analytics and DB Guide suggest about themselves, in a panel on the right. Picking
 * one asks it and closes the panel.
 */
export function ExploreQuestions({
  questions,
  disabled,
  onAsk,
  onClose,
}: {
  questions: SuggestedQuestions;
  disabled: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (question: string) =>
    words.every((word) => question.toLowerCase().includes(word));
  const groups = GROUPS.map((group) => ({
    ...group,
    items: questions[group.key].filter(matches),
  })).filter((group) => group.items.length > 0);

  return (
    <SideFlyout
      kicker="Explore questions"
      title="What would you like to know?"
      onClose={onClose}
    >
      <label className="eq-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={filter}
          placeholder="Filter questions"
          aria-label="Filter questions"
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      {groups.length === 0 && (
        <p className="dbt-text">
          {words.length
            ? 'No question matches. Ask your own instead.'
            : 'No suggested questions are available right now.'}
        </p>
      )}
      {groups.map((group) => (
        <section className="dbt-section" key={group.key}>
          <h3 className="ia-label">{group.title}</h3>
          <ul className="eq-list">
            {group.items.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onAsk(question);
                    onClose();
                  }}
                >
                  {question}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SideFlyout>
  );
}
