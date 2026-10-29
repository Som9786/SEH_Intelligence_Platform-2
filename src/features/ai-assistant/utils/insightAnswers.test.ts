import { describe, expect, it } from 'vitest';
import { answerQuestion, SUGGESTED_QUESTIONS } from './insightAnswers';

describe('answerQuestion', () => {
  it('has a sample answer for every suggested question', () => {
    for (const question of SUGGESTED_QUESTIONS) {
      expect(answerQuestion(question, undefined).route).toContain(
        'Insights Assistant',
      );
      expect(answerQuestion(question, undefined).confidence).toBeDefined();
    }
  });

  it('answers Store 124 waste separately from waste in general', () => {
    expect(
      answerQuestion('Why is waste higher at Store 124?', undefined).route,
    ).toContain('Fresh food analysis');
    expect(
      answerQuestion('Where are we seeing potential waste?', undefined).route,
    ).toContain('Cross-data analysis');
  });

  it('says plainly when it cannot answer a question', () => {
    const answer = answerQuestion('What is the weather tomorrow?', undefined);
    expect(answer.summary[0]).toMatch(/can’t answer that yet/);
    expect(answer.confidence).toBeUndefined();
    expect(answer.chart).toBeUndefined();
  });
});
