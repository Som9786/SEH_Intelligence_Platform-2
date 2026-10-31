import type { ReactNode } from 'react';

export function PageHeading({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {badge}
    </header>
  );
}
