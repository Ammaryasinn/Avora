export class AIConfigurationError extends Error {
  readonly retryable = false;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly code = "PROVIDER_ERROR",
  ) {
    super(message);
  }
}

export class AIUsageLimitError extends Error {
  readonly retryable = false;
}
