import type { LucideIcon } from 'lucide-react';
import { PageHeading } from './PageHeading';

export function PlaceholderPage({
  icon: Icon,
  eyebrow,
  title,
  description,
  detail,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="page-content">
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        badge={<span className="tag tag-orange">Coming later</span>}
      />
      <section
        className="placeholder-panel"
        aria-label={title + ' placeholder'}
      >
        <div className="placeholder-icon">
          <Icon size={30} aria-hidden="true" />
        </div>
        <p className="eyebrow">Planned feature</p>
        <h2>{title} is coming later</h2>
        <p>{detail}</p>
      </section>
    </div>
  );
}
