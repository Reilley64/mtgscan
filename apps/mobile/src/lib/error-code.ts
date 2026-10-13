export function errorCode(error: unknown): string {
  return (error as { code?: string }).code ?? String(error);
}
