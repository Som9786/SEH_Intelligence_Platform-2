import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewService } from './reviewService';

const sample = {
  tableId: 'dbo.Customers',
  status: 'verified',
  comment: 'Looks right.',
  reviewedBy: 'Admin',
  updatedAt: '2026-10-15T09:30:00Z',
};

function respond(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('reviewService', () => {
  it('reads a table review through the gateway', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(String(url));
      return respond(sample);
    });
    expect(await reviewService.getReview('dbo.Customers')).toEqual(sample);
    expect(urls[0]).toMatch(/\/api\/workspace\/reviews\/dbo\.Customers$/);
  });

  it('returns null when the table has no review yet', async () => {
    vi.stubGlobal('fetch', async () =>
      respond({ detail: 'No review for that table with that id.' }, 404),
    );
    expect(await reviewService.getReview('dbo.Missing')).toBeNull();
  });

  it('rejects a review that is malformed or describes another table', async () => {
    vi.stubGlobal('fetch', async () => respond({ ...sample, status: 'maybe' }));
    await expect(reviewService.getReview('dbo.Customers')).rejects.toThrow(
      /not valid/,
    );
    vi.stubGlobal('fetch', async () =>
      respond({ ...sample, tableId: 'dbo.Other' }),
    );
    await expect(reviewService.getReview('dbo.Customers')).rejects.toThrow(
      /not valid/,
    );
  });

  it('surfaces server errors instead of treating them as "not reviewed"', async () => {
    vi.stubGlobal('fetch', async () => respond('', 500));
    await expect(reviewService.getReview('dbo.ServerError')).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it('saves the status and comment; the server sets the reviewer', async () => {
    let sent: { method?: string; body?: string } = {};
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent = { method: init.method, body: String(init.body) };
      return respond({ ...sample, status: 'needs-attention', comment: 'Fix' });
    });
    const saved = await reviewService.saveReview({
      tableId: 'dbo.Customers',
      status: 'needs-attention',
      comment: 'Fix',
      reviewedBy: 'Someone else',
    });
    expect(sent.method).toBe('PUT');
    expect(JSON.parse(sent.body!)).toEqual({
      status: 'needs-attention',
      comment: 'Fix',
    });
    expect(saved.reviewedBy).toBe('Admin');
  });
});
