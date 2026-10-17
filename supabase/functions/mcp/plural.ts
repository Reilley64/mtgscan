export function plural(amount: number, one: string, many = `${one}s`): string {
  return `${amount} ${amount === 1 ? one : many}`;
}
