import {
  ClipboardCheck,
  ClipboardPen,
  FileSpreadsheet,
  Sparkles,
  TableProperties,
} from 'lucide-react';
import type { TableRecord } from '../types/tableDetails';
import { exportSchemaToExcel } from '../utils/exportSchema';

/**
 * Page-level actions for the open table: download its schema as Excel, and flip between the
 * schema (Overview) and the AI-generated documentation. The second button always offers the
 * view you are not on.
 */
export function TableActions({
  table,
  showingAi,
  hasReview,
  onReview,
  onToggleAi,
}: {
  table: TableRecord;
  showingAi: boolean;
  /** A review already exists, so the button offers to edit it. */
  hasReview: boolean;
  onReview: () => void;
  onToggleAi: () => void;
}) {
  const Icon = showingAi ? TableProperties : Sparkles;
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
      <button
        type="button"
        className="td-action td-action-primary"
        aria-pressed={showingAi}
        onClick={onToggleAi}
      >
        <Icon size={16} aria-hidden="true" />
        {showingAi ? 'Schema' : 'Documentation'}
      </button>
    </div>
  );
}
