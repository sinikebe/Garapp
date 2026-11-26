/** Optional v2 extension: recurring checks stay with the vehicle and its backups. */
const id = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export function validateMaintenanceCheck(check) {
  if (!check || typeof check !== 'object' || Array.isArray(check) || !id(check.id)
    || typeof check.name !== 'string' || !check.name.trim() || check.name.length > 2000
    || !Number.isInteger(check.intervalDays) || check.intervalDays < 1 || check.intervalDays > 36500
    || !date(check.firstDate) || (check.enabled !== undefined && typeof check.enabled !== 'boolean')
    || typeof (check.notes ?? '') !== 'string' || (check.notes?.length ?? 0) > 1000000) {
    throw Error('Un contrôle régulier doit avoir un nom, une première échéance valide et une fréquence de 1 à 36 500 jours.');
  }
  return { ...check, enabled: check.enabled !== false, notes: check.notes ?? '' };
}

export function validateMaintenanceLink(record) {
  if (record.maintenanceCheckId !== undefined && !id(record.maintenanceCheckId)) throw Error('Le lien vers un contrôle régulier est invalide.');
}
