import { Check, Code2, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { laidOut, sqlTokens } from '../utils/sqlTokens';

/**
 * A SQL query in a dark panel, coloured like an editor (keywords, names, strings, numbers,
 * comments), with a button that copies it.
 */
export function SqlCode({
  sql,
  className,
}: {
  sql: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(sql).then(() => setCopied(true));
  };

  return (
    <div className={`sql-block${className ? ` ${className}` : ''}`}>
      <div className="sql-head">
        <span className="sql-lang">
          <Code2 size={15} aria-hidden="true" />
          SQL
        </span>
        <button
          type="button"
          className="sql-copy"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy query'}
          title={copied ? 'Copied' : 'Copy query'}
        >
          {copied ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
        </button>
      </div>
      <pre className="sql-code">
        <code>
          {laidOut(sqlTokens(sql)).map((token, i) =>
            token.kind === 'text' ? (
              token.text
            ) : (
              <span key={i} className={`sql-${token.kind}`}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
