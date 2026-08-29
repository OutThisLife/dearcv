export type LlmProvider = "openrouter" | "openai" | "anthropic";

export const PROVIDERS: {
  id: LlmProvider;
  label: string;
  placeholder: string;
}[] = [
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-…" },
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
];

export const providerLabel = (id: LlmProvider) =>
  PROVIDERS.find((item) => item.id === id)?.label ?? id;
