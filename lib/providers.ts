export type LlmProvider = "openrouter" | "openai" | "anthropic";

export const PROVIDERS: {
  id: LlmProvider;
  label: string;
  placeholder: string;
  /** Where a key for this provider is made, and what that place is called. */
  keys: { url: string; label: string };
}[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    placeholder: "sk-or-…",
    keys: { url: "https://openrouter.ai/settings/keys", label: "OpenRouter" },
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-…",
    keys: { url: "https://platform.openai.com/api-keys", label: "the OpenAI dashboard" },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-…",
    keys: { url: "https://platform.claude.com/settings/keys", label: "the Claude Console" },
  },
];

export const providerLabel = (id: LlmProvider) =>
  PROVIDERS.find((item) => item.id === id)?.label ?? id;
