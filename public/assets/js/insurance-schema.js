/** Portable monthly insurance contracts and payment links. Unknown fields survive imports. */
import { isAmount } from './amounts.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw Error(message); };
export const isInsurancePeriod = (value) => typeof value === 'string' && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
export const isInsuranceDate = (value) => typeof value === 'string' && isInsurancePeriod(value.slice(0, 7)) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const isPremium = (value) => value !== null && isAmount(value) && !value.startsWith('-');

export function validateInsuranceContract(contract) {
  check(object(contract) && typeof contract.id === 'string' && /^[\w-]{1,128}$/.test(contract.id), 'L’identifiant du contrat d’assurance est invalide.');
  for (const field of ['provider', 'reference']) check(contract[field] === undefined || typeof contract[field] === 'string' && contract[field].length <= 2000, 'L’assureur ou la référence du contrat est invalide.');
  check(isInsuranceDate(contract.firstDate), 'La première échéance d’assurance doit être une date valide entre 1900 et 2199.');
  check(Number.isSafeInteger(contract.debitDay) && contract.debitDay >= 1 && contract.debitDay <= 31, 'Le jour de prélèvement doit être compris entre 1 et 31.');
  check(contract.endDate == null || isInsuranceDate(contract.endDate) && contract.endDate >= contract.firstDate, 'La fin du contrat doit suivre sa première échéance.');
  check(Array.isArray(contract.tariffs) && contract.tariffs.length > 0 && contract.tariffs.length <= 1000, 'Un contrat doit comporter entre 1 et 1 000 tarifs mensuels.');
  for (const tariff of contract.tariffs) check(object(tariff) && isInsurancePeriod(tariff.from) && isPremium(tariff.amount), 'Un tarif d’assurance doit indiquer un mois et un montant mensuel positif ou nul, en chaîne décimale.');
  check(contract.tariffs.some((tariff) => tariff.from <= contract.firstDate.slice(0, 7)), 'Aucun tarif ne couvre la première échéance d’assurance.');
  if (contract.skippedPeriods !== undefined) check(Array.isArray(contract.skippedPeriods) && contract.skippedPeriods.length <= 3600 && contract.skippedPeriods.every(isInsurancePeriod) && new Set(contract.skippedPeriods).size === contract.skippedPeriods.length, 'Les échéances d’assurance exclues sont invalides ou dupliquées.');
  return { ...contract, provider: contract.provider ?? '', reference: contract.reference ?? '', endDate: contract.endDate ?? null, tariffs: contract.tariffs.map((tariff) => ({ ...tariff })) };
}

/** A payment belongs to exactly one contract/month, including copies in the recycle bin. */
export function validateInsurancePayment(record, contracts, periods) {
  if (record.insurance === undefined) return;
  const link = record.insurance;
  check(record.type === 'insurance' && object(link) && contracts.has(link.contractId) && isInsurancePeriod(link.period), 'Un prélèvement d’assurance désigne un contrat absent, un mois invalide ou un type incohérent.');
  for (const flag of ['generated', 'overridden', 'autoStatus']) check(link[flag] === undefined || typeof link[flag] === 'boolean', 'Les indicateurs du prélèvement d’assurance sont invalides.');
  const key = `${link.contractId}:${link.period}`;
  check(!periods.has(key), 'Deux prélèvements d’assurance désignent le même contrat et le même mois, corbeille comprise.');
  periods.add(key);
}
