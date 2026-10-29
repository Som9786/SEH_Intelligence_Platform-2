import type { LucideIcon } from 'lucide-react';
import { PageHeading } from './PageHeading';

/** Placeholder for a sidebar page that is planned but not built yet. */
export function ComingSoonPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="page-content">
      <PageHeading title={title} description={description} />
      <section
        className="placeholder-panel"
        aria-label={`${title} coming soon`}
      >
        <div className="placeholder-icon">
          <Icon size={30} aria-hidden="true" />
        </div>
        <p className="eyebrow">Coming soon</p>
        <h2>{title}</h2>
        <p>This page is planned and will be available in a later release.</p>
      </section>
    </div>
  );
}
