namespace Insights.AiHub.Configuration;

/// Used when Llm:Provider is "Bedrock". Calls go to the Amazon Bedrock Converse API, so Model can be any Bedrock model ID
/// or inference profile ID that supports structured (JSON schema) output.
///
/// Credentials, first match wins: ApiKey (a Bedrock API key), then AccessKeyId + SecretAccessKey (+ SessionToken), then the
/// AWS_BEARER_TOKEN_BEDROCK environment variable, then the default AWS chain (AWS_ACCESS_KEY_ID, AWS_PROFILE, ~/.aws, an
/// instance role).
public sealed class BedrockOptions : LlmProviderOptions
{
    public const string SectionName = "Bedrock";

    /// The AWS region the model is enabled in, such as us-east-1.
    public string Region { get; set; } = "us-east-1";
    /// A Bedrock API key (long- or short-term), sent as a bearer token.
    public string ApiKey { get; set; } = "";
    public string AccessKeyId { get; set; } = "";
    public string SecretAccessKey { get; set; } = "";
    /// Only for temporary credentials.
    public string SessionToken { get; set; } = "";
    /// The most tokens one reply may use.
    public int MaxTokens { get; set; } = 8192;
    /// low, medium, high, xhigh or max, for models that support it (recent Claude models). Empty leaves the model's default.
    public string Effort { get; set; } = "";
}
