import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../useAuth';

/** Renders the page only when the user's roles give its functionality; otherwise says so. */
export function RequireFeature({
  feature,
  children,
}: {
  feature: string;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (can(feature)) return children;
  return (
    <div className="page-content">
      <div className="state-panel" role="status">
        <Lock size={28} aria-hidden="true" />
        <h2>You don't have access to this page</h2>
        <p>
          Your role doesn't include it. Ask an administrator if you need it.
        </p>
      </div>
    </div>
  );
}
