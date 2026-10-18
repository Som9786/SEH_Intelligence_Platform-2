import { useState } from 'react';
import {
  ArrowUp01,
  KeyRound,
  KeySquare,
  Link2,
  type LucideIcon,
} from 'lucide-react';
import type { ColumnRow } from '../utils/columnBadges';

type Kind = 'pk-identity' | 'pk' | 'fk' | 'identity';

interface KeyInfo {
  kind: Kind;
  Icon: LucideIcon;
  title: string;
  lines: string[];
}

/**
 * One icon per column, chosen by priority: an identity primary key (the common surrogate key) gets
 * its own icon, then primary key, foreign key, and identity alone. Every fact that applies is
 * listed in the hover text, so nothing is lost when a column has more than one role.
 */
function columnKeyInfo(
  row: Pick<ColumnRow, 'pk' | 'fk' | 'identity' | 'fkTarget'>,
): KeyInfo | null {
  const lines = [
    row.pk && 'Uniquely identifies each row',
    row.fk &&
      (row.fkTarget
        ? `References ${row.fkTarget}`
        : 'References another table'),
    row.identity && 'Value is generated automatically',
  ].filter((line): line is string => Boolean(line));

  if (row.pk && row.identity)
    return {
      kind: 'pk-identity',
      Icon: KeySquare,
      title: 'Primary key · Identity',
      lines,
    };
  if (row.pk)
    return {
      kind: 'pk',
      Icon: KeyRound,
      title: row.fk ? 'Primary key · Foreign key' : 'Primary key',
      lines,
    };
  if (row.fk)
    return {
      kind: 'fk',
      Icon: Link2,
      title: row.identity ? 'Foreign key · Identity' : 'Foreign key',
      lines,
    };
  if (row.identity)
    return { kind: 'identity', Icon: ArrowUp01, title: 'Identity', lines };
  return null;
}

const TIP_GAP = 8;
const TIP_HEIGHT = 96; // enough for a title and three lines

export function ColumnKeyIcon({
  row,
}: {
  row: Pick<ColumnRow, 'pk' | 'fk' | 'identity' | 'fkTarget'>;
}) {
  const info = columnKeyInfo(row);
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  if (!info) {
    return (
      <span className="td-col-empty" aria-label="None">
        —
      </span>
    );
  }
  const { Icon, kind, title, lines } = info;
  // The tooltip is fixed-positioned from the icon's box, so the table's scroll area cannot clip it.
  // It opens below the icon, or above it when there is no room below.
  const show = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    const below = box.bottom + TIP_GAP + TIP_HEIGHT <= window.innerHeight;
    setTip({
      left: box.left,
      top: below ? box.bottom + TIP_GAP : box.top - TIP_GAP - TIP_HEIGHT,
    });
  };
  return (
    <span
      className={`td-col-icon td-col-icon-${kind} td-col-key`}
      tabIndex={0}
      aria-label={`${title}. ${lines.join('. ')}`}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setTip(null)}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setTip(null)}
    >
      <Icon size={16} aria-hidden="true" />
      {tip && (
        <span
          className="td-col-tip"
          role="tooltip"
          aria-hidden="true"
          style={{ left: tip.left, top: tip.top }}
        >
          <strong>{title}</strong>
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      )}
    </span>
  );
}
