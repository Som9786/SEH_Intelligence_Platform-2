using System.Text.Json;
using Insights.Analytics.Models;

namespace Insights.Analytics.Services.Dataset;

/// Keeps 👍 / 👎 ratings of answers, one JSON object per line in App_Data/feedback.jsonl, to find questions the AI
/// gets wrong and good answers worth saving as examples.
public sealed class FeedbackStore(IHostEnvironment env, ILogger<FeedbackStore> logger)
{
    readonly Lock gate = new();
    readonly string path = Path.Combine(env.ContentRootPath, "App_Data", "feedback.jsonl");

    public Feedback Add(FeedbackRequest request)
    {
        var entry = new Feedback(DateTimeOffset.UtcNow, request.Question.Trim(), request.Sql, request.Answer, request.Rating,
            string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim());
        lock (gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.AppendAllText(path, JsonSerializer.Serialize(entry, JsonSerializerOptions.Web) + "\n");
        }
        logger.LogInformation("Feedback: {Rating} for \"{Question}\"", entry.Rating, entry.Question);
        return entry;
    }

    /// The newest entries first.
    public IReadOnlyList<Feedback> Latest(int count)
    {
        lock (gate)
        {
            if (!File.Exists(path))
                return [];
            return File.ReadLines(path).Reverse().Take(count)
                .Select(line => JsonSerializer.Deserialize<Feedback>(line, JsonSerializerOptions.Web))
                .OfType<Feedback>().ToList();
        }
    }
}
