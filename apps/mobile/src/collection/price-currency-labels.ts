import type { ConversionFields } from '@mtgscan/supabase/converted-prices';

export type PriceAmount = { amount: string; currency: string } & Pick<ConversionFields, 'approximate'>;

const currencies: Record<string, { name: string; narrowSymbol: string }> = {
  AUD: { name: 'Australian dollar', narrowSymbol: '$' },
  BRL: { name: 'Brazilian real', narrowSymbol: 'R$' },
  CAD: { name: 'Canadian dollar', narrowSymbol: '$' },
  CHF: { name: 'Swiss franc', narrowSymbol: 'CHF' },
  CNY: { name: 'Chinese yuan', narrowSymbol: '¥' },
  CZK: { name: 'Czech koruna', narrowSymbol: 'Kč' },
  DKK: { name: 'Danish krone', narrowSymbol: 'kr' },
  EUR: { name: 'Euro', narrowSymbol: '€' },
  GBP: { name: 'British pound', narrowSymbol: '£' },
  HKD: { name: 'Hong Kong dollar', narrowSymbol: '$' },
  HUF: { name: 'Hungarian forint', narrowSymbol: 'Ft' },
  IDR: { name: 'Indonesian rupiah', narrowSymbol: 'Rp' },
  ILS: { name: 'Israeli new shekel', narrowSymbol: '₪' },
  INR: { name: 'Indian rupee', narrowSymbol: '₹' },
  ISK: { name: 'Icelandic króna', narrowSymbol: 'kr' },
  JPY: { name: 'Japanese yen', narrowSymbol: '¥' },
  KRW: { name: 'South Korean won', narrowSymbol: '₩' },
  MXN: { name: 'Mexican peso', narrowSymbol: '$' },
  MYR: { name: 'Malaysian ringgit', narrowSymbol: 'RM' },
  NOK: { name: 'Norwegian krone', narrowSymbol: 'kr' },
  NZD: { name: 'New Zealand dollar', narrowSymbol: '$' },
  PHP: { name: 'Philippine peso', narrowSymbol: '₱' },
  PLN: { name: 'Polish złoty', narrowSymbol: 'zł' },
  RON: { name: 'Romanian leu', narrowSymbol: 'lei' },
  SEK: { name: 'Swedish krona', narrowSymbol: 'kr' },
  SGD: { name: 'Singapore dollar', narrowSymbol: '$' },
  THB: { name: 'Thai baht', narrowSymbol: '฿' },
  TRY: { name: 'Turkish lira', narrowSymbol: '₺' },
  USD: { name: 'US dollar', narrowSymbol: '$' },
  ZAR: { name: 'South African rand', narrowSymbol: 'R' },
};

const noBreakSpace = '\u00a0';

export function priceCurrencyLabel(currency: string) {
  const name = currencies[currency]?.name;
  return name ? `${currency} ${name}` : currency;
}

export function minorUnitDigitsOf(amount: string) {
  return amount.split('.')[1]?.length ?? 0;
}

export function shownPrice({ amount, currency }: Pick<PriceAmount, 'amount' | 'currency'>) {
  const digits = minorUnitDigitsOf(amount);
  const narrowSymbol = currencies[currency]?.narrowSymbol;
  if (!narrowSymbol) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
      Number(amount),
    );
  }
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(amount));
  return /\p{L}$/u.test(narrowSymbol) ? `${narrowSymbol}${noBreakSpace}${number}` : `${narrowSymbol}${number}`;
}

export function spokenPrice(price: PriceAmount) {
  const shown = shownPrice(price);
  return price.approximate ? `about ${shown}` : shown;
}

export type PriceLabels = { shown: string | undefined; stale: boolean; spoken: string };

export function priceLabels(price: (PriceAmount & { stale?: boolean }) | null): PriceLabels {
  return price
    ? { shown: shownPrice(price), stale: price.stale ?? false, spoken: spokenPrice(price) }
    : { shown: undefined, stale: false, spoken: 'no price' };
}
