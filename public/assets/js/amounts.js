/** Exact decimal euros. Stored values are strings; rounding is only for display. */
export const isAmount = (value) => value === null || (typeof value === 'string' && /^-?\d{1,12}(?:\.\d{1,18})?$/.test(value));

export function amountInput(value) {
  const text = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!text) return null;
  if (!isAmount(text)) throw Error('Saisissez un montant décimal valide, ou laissez le montant inconnu.');
  return text;
}

const parts = (value) => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  return { negative, whole, fraction, scale: fraction.length, integer: BigInt(whole + fraction) * (negative ? -1n : 1n) };
};

export function sumAmounts(values) {
  const entries = values.filter((value) => value !== null && value !== undefined).map(parts);
  const scale = Math.max(0, ...entries.map((value) => value.scale));
  const total = entries.reduce((sum, value) => sum + value.integer * 10n ** BigInt(scale - value.scale), 0n);
  const sign = total < 0n ? '-' : '';
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  if (!scale) return sign + digits;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return sign + digits.slice(0, -scale) + (fraction ? '.' + fraction : '');
}

export function cents(value) {
  const parsed = parts(value);
  if (parsed.scale <= 2) return parsed.integer * 10n ** BigInt(2 - parsed.scale);
  const absolute = parsed.integer < 0n ? -parsed.integer : parsed.integer;
  const divisor = 10n ** BigInt(parsed.scale - 2);
  const rounded = (absolute + divisor / 2n) / divisor;
  return parsed.negative ? -rounded : rounded;
}

export function formatAmount(value) {
  if (value === null || value === undefined) return 'Non renseigné';
  const rounded = cents(value);
  const absolute = rounded < 0n ? -rounded : rounded;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${rounded < 0n ? '−' : ''}${(absolute / 100n).toLocaleString('fr-FR')}${fraction === '00' ? '' : ',' + fraction}\u00a0€`;
}

export function formatExactAmount(value) {
  if (value === null || value === undefined) return 'Non renseigné';
  const parsed = parts(value);
  return `${parsed.negative ? '−' : ''}${BigInt(parsed.whole).toLocaleString('fr-FR')}${parsed.fraction ? ',' + parsed.fraction : ''}\u00a0€`;
}
