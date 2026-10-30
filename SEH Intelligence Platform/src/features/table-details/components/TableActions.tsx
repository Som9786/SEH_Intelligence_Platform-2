import { ClipboardCheck, ClipboardPen, FileSpreadsheet } from 'lucide-react';
import type { TableRecord } from '../types/tableDetails';
import { exportSchemaToExcel } from '../utils/exportSchema';

/** Page-level actions for the open table: review it, or download its schema as Excel. */
export function TableActions({
  table,
  hasReview,
  onReview,
}: {
  table: TableRecord;
  /** A review already exists, so the button offers to edit it. */
  hasReview: boolean;
  onReview: () => void;
}) {
  const ReviewIcon = hasReview ? ClipboardPen : ClipboardCheck;
  return (
    <div className="td-actions">
      <button type="button" className="td-action" onClick={onReview}>
        <ReviewIcon size={16} aria-hidden="true" />
        {hasReview ? 'Edit review' : 'Review'}
      </button>
      <button
        type="button"
        className="td-action"
        onClick={() => exportSchemaToExcel(table)}
      >
        <FileSpreadsheet size={16} aria-hidden="true" />
        Export to Excel
      </button>
    </div>
  );
}
