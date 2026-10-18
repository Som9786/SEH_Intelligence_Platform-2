export function formatGeneratedAt(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Unavailable';
  return (
    new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  );
}
