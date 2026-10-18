import type { ReviewStatus } from '../types/review';

export const REVIEW_STATUS_OPTIONS: {
  value: ReviewStatus;
  label: string;
  description: string;
}[] = [
  {
    value: 'verified',
    label: 'Verified',
    description: 'Metadata and documentation approved.',
  },
  {
    value: 'needs-attention',
    label: 'Needs Attention',
    description: 'Corrections or further review required.',
  },
];

export const NOT_REVIEWED_LABEL = 'Not Reviewed';

export function reviewStatusLabel(status: ReviewStatus | null): string {
  return (
    REVIEW_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    NOT_REVIEWED_LABEL
  );
}

export function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
