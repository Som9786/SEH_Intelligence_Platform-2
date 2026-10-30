using Insights.AiHub.Configuration;

namespace Insights.AiHub.Services.Llm;

public enum LlmRole { System, User, Assistant }

/// One message of a model call, the same for every provider.
public sealed record LlmMessage(LlmRole Role, string Text)
{
    public static LlmMessage System(string text) => new(LlmRole.System, text);
    public static LlmMessage User(string text) => new(LlmRole.User, text);
    public static LlmMessage Assistant(string text) => new(LlmRole.Assistant, text);
}

/// The JSON schema the model's reply must follow. Schemas are written strict (every property required, no extra ones), which
/// both OpenAI and Bedrock accept.
public sealed record LlmJsonSchema(string Name, string Schema);

/// One model service: OpenAI or Amazon Bedrock.
public interface ILlmProvider
{
    /// For logs and error messages, and the appsettings section that configures it.
    string Name { get; }
    /// The current settings, read again on each use so appsettings.json changes apply without a restart.
    LlmProviderOptions Options { get; }
    Task<LlmReply> CompleteAsync(IReadOnlyList<LlmMessage> messages, LlmJsonSchema? schema, CancellationToken ct);
}
