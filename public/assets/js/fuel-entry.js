/** Small fuel editor updates only its own fields, retaining historical detail. */
import { amountInput } from './amounts.js';
import { recordCost } from './garage.js';

export function fuelUnitPrice(record) {
  const total = recordCost(record).total, litres = Number(record.fuel?.litres);
  const price = total !== null && Number(total) >= 0 && litres > 0 ? Number(total) / litres : NaN;
  return Number.isFinite(price) ? price : null;
}

export function updateFuelEntry(original, values) {
  let litres;
  try { litres = amountInput(values.litres); }
  catch { throw Error('Saisissez une quantité de carburant valide en litres, ou laissez-la inconnue.'); }
  if (litres !== null && !(Number(litres) > 0 && Number(litres) <= 10000)) throw Error('La quantité de carburant doit être positive et ne pas dépasser 10 000 L.');
  const odometer = String(values.odometer ?? '').trim();
  if (odometer && (!Number.isInteger(Number(odometer)) || Number(odometer) < 0 || Number(odometer) > 5000000)) throw Error('Saisissez un kilométrage entier valide, ou laissez-le inconnu.');
  if (!['', 'true', 'false'].includes(values.fullTank)) throw Error('Précisez si le plein est complet, partiel ou inconnu.');
  const total = amountInput(values.totalAmount);
  return {
    ...original, title: original.title || 'Plein de carburant', type: 'fuel', status: values.status ?? original.status ?? 'done',
    date: values.date || null, odometer: odometer ? Number(odometer) : null,
    totalAmount: original.totalAmount === null && total === recordCost(original).total ? null : total,
    fuel: { ...original.fuel, litres, fullTank: values.fullTank === '' ? null : values.fullTank === 'true' },
    notes: values.notes, documents: values.documents,
  };
}
