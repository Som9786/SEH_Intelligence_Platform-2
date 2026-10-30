import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

/** Back button for the pages opened from DB Catalog. */
export function BackToDbCatalog() {
  return (
    <Link to="/db-catalog" className="td-action" title="Back to DB Catalog">
      <ArrowLeft size={16} aria-hidden="true" />
      Back
    </Link>
  );
}
