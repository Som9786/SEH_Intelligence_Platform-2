using System.Text.Json.Serialization;

namespace Insights.Analytics.Models;

[JsonConverter(typeof(JsonStringEnumConverter<FeedbackRating>))]
public enum FeedbackRating
{
    Up,
    Down,
}

/// Body of POST /feedback: a rating of one answer, with what produced it.
public sealed record FeedbackRequest(string Question, string? Sql, string? Answer, FeedbackRating Rating, string? Comment);

/// One saved rating, as returned by GET /feedback.
public sealed record Feedback(DateTimeOffset At, string Question, string? Sql, string? Answer, FeedbackRating Rating, string? Comment);

/// Body of POST /examples.
public sealed record ExampleRequest(string Question, string Sql);
