namespace Insights.AiHub.Configuration;

public sealed class AnswerOptions
{
    public const string SectionName = "Answer";

    /// Results longer than this (as JSON) are cut before being sent to the model.
    public int MaxResultChars { get; set; } = 50_000;
}
