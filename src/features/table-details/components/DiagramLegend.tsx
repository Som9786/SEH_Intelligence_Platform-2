import { KeyRound, Link } from 'lucide-react';
import type { ReactNode } from 'react';

/** A small PK or FK badge, for use inside a diagram or its legend. */
export function KeyMark({ kind }: { kind: 'pk' | 'fk' }) {
  const Icon = kind === 'pk' ? KeyRound : Link;
  return (
    <span
      className={`key-badge key-badge-${kind} er-key`}
      title={kind === 'pk' ? 'Primary key' : 'Foreign key'}
    >
      <Icon size={10} strokeWidth={2.6} aria-hidden="true" />
      {kind === 'pk' ? 'PK' : 'FK'}
    </span>
  );
}

/**
 * The bar above a relationship diagram that explains its lines and badges. Both diagrams (Table
 * Details and the ER explorer) use it, with their own controls on the right.
 */
export function DiagramLegend({ children }: { children?: ReactNode }) {
  return (
    <div className="diagram-legend">
      <ul aria-label="Diagram legend">
        <li>
          <span className="legend-line" aria-hidden="true" /> Confirmed FK
        </li>
        <li>
          <span
            className="legend-line legend-line-inferred"
            aria-hidden="true"
          />{' '}
          <span className="inferred">Inferred</span>
        </li>
        <li>
          <KeyMark kind="pk" /> Primary key
        </li>
        <li>
          <KeyMark kind="fk" /> Foreign key
        </li>
      </ul>
      {children}
    </div>
  );
}
