// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clearThreads, loadThread, saveThread } from './threadStore';

afterEach(() => sessionStorage.clear());

describe('threadStore', () => {
  it('keeps a thread per user', () => {
    saveThread('Admin', [{ question: 'Q1', status: 'error', error: 'e' }]);
    expect(loadThread('admin')).toEqual([
      { question: 'Q1', status: 'error', error: 'e' },
    ]);
    expect(loadThread('Viewer')).toEqual([]);
  });

  it('shows a question left unanswered as interrupted', () => {
    saveThread('Admin', [{ question: 'Q1', status: 'pending' }]);
    expect(loadThread('Admin')).toEqual([
      {
        question: 'Q1',
        status: 'error',
        error: expect.stringMatching(/interrupted/),
      },
    ]);
  });

  it('forgets an empty thread, and every thread on sign-out', () => {
    saveThread('Admin', [{ question: 'Q1', status: 'error', error: 'e' }]);
    saveThread('Admin', []);
    expect(sessionStorage.length).toBe(0);
    saveThread('Admin', [{ question: 'Q1', status: 'error', error: 'e' }]);
    sessionStorage.setItem('other', 'kept');
    clearThreads();
    expect(loadThread('Admin')).toEqual([]);
    expect(sessionStorage.getItem('other')).toBe('kept');
  });

  it('ignores a broken saved thread', () => {
    sessionStorage.setItem('seh.assistant.thread.admin', '{not json');
    expect(loadThread('Admin')).toEqual([]);
  });
});
