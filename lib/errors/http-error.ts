export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;

  constructor(status: number, code: string, publicMessage: string) {
    super(publicMessage);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}
