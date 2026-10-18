import { ArrowUp01, ArrowUpRight, KeyRound } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { ColumnRow } from '../utils/columnBadges';
import { KEY_KINDS, type KeyKind } from '../utils/keyKinds';

const ICONS = { pk: KeyRound, fk: ArrowUpRight, identity: ArrowUp01 } as const;
const TIP_GAP = 8;
const TIP_HEIGHT = 96; // enough for a title and three lines

/**
 * One key indicator: PK (green key), FK (blue arrow) or Identity (grey). A tooltip explains what it
 * means, and screen readers get the same text. `label` replaces the default "PK"/"FK" text,
 * `extra` adds a sentence to the tooltip, `iconOnly` shrinks it to just the icon.
 */
export function KeyBadge({
  kind,
  label,
  extra,
  iconOnly = false,
  children,
}: {
  kind: KeyKind;
  label?: string;
  extra?: string;
  iconOnly?: boolean;
  children?: ReactNode;
}) {
  const info = KEY_KINDS[kind];
  const Icon = ICONS[kind];
  const id = useId();
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const lines = [info.definition, ...(extra ? [extra] : [])];

  // The tooltip is fixed-positioned from the badge's box, so a table's scroll area cannot clip it.
  // It opens below the badge, or above it when there is no room below.
  const show = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    const below = box.bottom + TIP_GAP + TIP_HEIGHT <= window.innerHeight;
    setTip({
      left: Math.max(8, Math.min(box.left, window.innerWidth - 248)),
      top: below ? box.bottom + TIP_GAP : box.top - TIP_GAP - TIP_HEIGHT,
    });
  };

  return (
    <span
      className={`key-badge key-badge-${kind}${iconOnly ? ' key-badge-icon' : ''}`}
      tabIndex={0}
      role={iconOnly ? 'img' : undefined}
      aria-label={iconOnly ? info.title : undefined}
      aria-describedby={`${id}-description`}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setTip(null)}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setTip(null)}
    >
      <Icon size={iconOnly ? 14 : 12} strokeWidth={2.4} aria-hidden="true" />
      {!iconOnly && <span>{label ?? info.abbreviation}</span>}
      {children}
      <span id={`${id}-description`} className="td-sr-only">
        {info.title}. {lines.join(' ')}
      </span>
      {tip && (
        <span
          className="key-tip"
          role="tooltip"
          aria-hidden="true"
          style={{ left: tip.left, top: tip.top }}
        >
          <strong>{info.title}</strong>
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      )}
    </span>
  );
}

/** The Key cell of a column row: PK and FK both show when a column is both; Identity is a small icon. */
export function ColumnKeys({
  row,
}: {
  row: Pick<ColumnRow, 'pk' | 'fk' | 'identity' | 'fkTarget'>;
}) {
  if (!row.pk && !row.fk && !row.identity)
    return (
      <span className="td-col-empty" aria-label="None">
        —
      </span>
    );
  return (
    <span className="key-badges">
      {row.pk && <KeyBadge kind="pk" />}
      {row.fk && (
        <KeyBadge
          kind="fk"
          extra={row.fkTarget ? `References ${row.fkTarget}.` : undefined}
        />
      )}
      {row.identity && <KeyBadge kind="identity" iconOnly />}
    </span>
  );
}
