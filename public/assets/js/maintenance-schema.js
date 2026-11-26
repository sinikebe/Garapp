/** Optional v2 extension: recurring checks stay with the vehicle and its backups. */
const id = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export function validateMaintenanceCheck(check) {
  const cadence = check && ['intervalDays', 'intervalMonths', 'intervalKm'].filter((field) => check[field] != null);
  const limits = { intervalDays: 36500, intervalMonths: 1200, intervalKm: 1000000 };
  if (!check || typeof check !== 'object' || Array.isArray(check) || !id(check.id)
    || typeof check.name !== 'string' || !check.name.trim() || check.name.length > 2000
    || cadence.length !== 1 || !cadence.every((field) => Number.isInteger(check[field]) && check[field] >= 1 && check[field] <= limits[field])
    || (check.presetKey !== undefined && !id(check.presetKey))
    || !date(check.firstDate) || (check.enabled !== undefined && typeof check.enabled !== 'boolean')
    || typeof (check.notes ?? '') !== 'string' || (check.notes?.length ?? 0) > 1000000) {
    throw Error('Un contrôle doit avoir un nom, une première échéance valide et une fréquence positive en jours, mois ou kilomètres.');
  }
  return { ...check, enabled: check.enabled !== false, notes: check.notes ?? '' };
}

export function validateMaintenanceLink(record) {
  if (record.maintenanceCheckId !== undefined && !id(record.maintenanceCheckId)) throw Error('Le lien vers un contrôle régulier est invalide.');
}
