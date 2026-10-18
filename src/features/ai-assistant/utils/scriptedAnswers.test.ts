import { describe, expect, it } from 'vitest';
import { buildRelationshipIndex } from '../../table-details/utils/relationshipGraph';
import { scriptedReply, suggestedQuestions } from './scriptedAnswers';

const index = buildRelationshipIndex([
  {
    id: 'dbo.Customers',
    primaryKey: ['CustomerId'],
    relationships: [],
  },
  {
    id: 'dbo.Orders',
    primaryKey: ['OrderId'],
    relationships: [
      {
        direction: 'outgoing',
        relatedTable: 'dbo.Customers',
        columns: ['CustomerId'],
        relatedColumns: ['CustomerId'],
        cardinality: 'many-to-one',
        evidence: 'confirmed',
        meaning: null,
      },
    ],
  },
]);

describe('scripted assistant replies', () => {
  it('suggests a join question from a real relationship', () => {
    expect(suggestedQuestions(index)).toContain(
      'How would I join dbo.Orders and dbo.Customers?',
    );
  });

  it('answers a join question with the keys and an example', () => {
    const reply = scriptedReply(
      'How would I join Orders and Customers?',
      index,
    );
    expect(reply.paragraphs[0]).toContain('CustomerId');
    expect(reply.code).toContain('ON c.CustomerId = p.CustomerId');
  });

  it('lists primary keys and confirmed relationships', () => {
    expect(
      scriptedReply('Which tables have a primary key?', index).paragraphs[0],
    ).toContain('dbo.Orders (OrderId)');
    expect(
      scriptedReply('Which relationships are confirmed?', index).paragraphs[0],
    ).toContain('dbo.Orders (CustomerId) references dbo.Customers');
  });

  it('describes a table it is asked about and falls back otherwise', () => {
    expect(
      scriptedReply('tell me about customers', index).paragraphs[0],
    ).toContain('primary key CustomerId');
    expect(scriptedReply('hello', index).paragraphs[0]).toContain(
      'scripted answers',
    );
  });
});
