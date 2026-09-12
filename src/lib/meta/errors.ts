export class MetaApiError extends Error {
  readonly code?: string;
  readonly subcode?: string;
  readonly metaType?: string;
  readonly traceId?: string;
  readonly httpStatus?: number;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;
  readonly ambiguous: boolean;

  constructor(input: {
    message: string;
    code?: string;
    subcode?: string;
    metaType?: string;
    traceId?: string;
    httpStatus?: number;
    retryAfterSeconds?: number;
    retryable?: boolean;
    ambiguous?: boolean;
  }) {
    super(input.message);
    this.name = "MetaApiError";
    this.code = input.code;
    this.subcode = input.subcode;
    this.metaType = input.metaType;
    this.traceId = input.traceId;
    this.httpStatus = input.httpStatus;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.retryable = input.retryable ?? false;
    this.ambiguous = input.ambiguous ?? false;
  }
}
