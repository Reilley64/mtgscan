export const developmentLogPrefixes = {
  capture: 'CAPTURE ',
  recognition: 'RECOGNITION ',
  parity: 'PARITY ',
} as const;

export function logForDevelopment(kind: keyof typeof developmentLogPrefixes, line: object) {
  if (__DEV__) {
    console.info(`${developmentLogPrefixes[kind]}${JSON.stringify(line)}`);
  }
}
