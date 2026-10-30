namespace Insights.AiHub.Services.Llm;

/// The model answered, but with nothing usable: a refusal, no content, or a reply cut off at the token limit.
public sealed class LlmReplyException(string message) : Exception(message);
