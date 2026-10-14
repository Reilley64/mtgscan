const currencyNames: Record<string, string> = {
  AUD: 'Australian dollar',
  BRL: 'Brazilian real',
  CAD: 'Canadian dollar',
  CHF: 'Swiss franc',
  CNY: 'Chinese yuan',
  CZK: 'Czech koruna',
  DKK: 'Danish krone',
  EUR: 'Euro',
  GBP: 'British pound',
  HKD: 'Hong Kong dollar',
  HUF: 'Hungarian forint',
  IDR: 'Indonesian rupiah',
  ILS: 'Israeli new shekel',
  INR: 'Indian rupee',
  ISK: 'Icelandic króna',
  JPY: 'Japanese yen',
  KRW: 'South Korean won',
  MXN: 'Mexican peso',
  MYR: 'Malaysian ringgit',
  NOK: 'Norwegian krone',
  NZD: 'New Zealand dollar',
  PHP: 'Philippine peso',
  PLN: 'Polish złoty',
  RON: 'Romanian leu',
  SEK: 'Swedish krona',
  SGD: 'Singapore dollar',
  THB: 'Thai baht',
  TRY: 'Turkish lira',
  USD: 'US dollar',
  ZAR: 'South African rand',
};

export function priceCurrencyLabel(currency: string) {
  const name = currencyNames[currency];
  return name ? `${currency} ${name}` : currency;
}
