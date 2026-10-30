using System.Text.Json;

namespace Insights.AiHub.Models;

/// Body of POST /guide. Context is the part of a database catalog the question is about, as the caller (DB Guide) read it
/// from its catalog graph, passed through as raw JSON. History holds earlier questions and their answers, oldest first.
public sealed record GuideRequest(string Question, JsonElement Context, IReadOnlyList<GuideTurn>? History = null);

/// One earlier question and the answer given to it.
public sealed record GuideTurn(string Question, string Answer);

/// Response of POST /guide. Answer is Markdown; Tables are the schema-qualified tables it uses; Sql is an example query
/// for the reader to run, or empty. Usage is the tokens and cost of the model call; null with Cached = true when the same
/// question was answered before from the same context.
public sealed record GuideResponse(string Answer, IReadOnlyList<string> Tables, string Sql, LlmUsage? Usage = null, bool Cached = false);
