/** Official French prevention advice, reviewed 2026-11-26; these are not statutory deadlines. */
export const MAINTENANCE_GUIDE = 'https://www.securite-routiere.gouv.fr/sites/default/files/2024-09/dsr_guide_bon_conducteur.pdf';
export const TYRE_REFERENCE = 'https://www.alpes-de-haute-provence.gouv.fr/content/download/25301/144413/file/Etat%2520des%2520pneus.pdf';
export const TYRE_LAW = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042266112';
export const MAINTENANCE_PRESETS = Object.freeze([
  { key: 'fr-tyre-pressure', name: 'Pression des pneus', intervalMonths: 1, source: TYRE_REFERENCE,
    match: /pression.*pneu|pneu.*pression/,
    notes: 'À vérifier aussi avant un long trajet. Contrôler à froid, à la pression indiquée par le constructeur sur le véhicule ou sa notice. Aucune pression universelle en bars.' },
  { key: 'fr-engine-oil', name: 'Niveau d’huile moteur', intervalKm: 2500, source: MAINTENANCE_GUIDE,
    match: /niveau.*huile|huile.*niveau/,
    notes: 'Contrôler aussi avant un long trajet. Applicable aux motorisations qui possèdent un circuit d’huile moteur ; suivre la notice du véhicule.' },
  { key: 'fr-coolant', name: 'Niveau de liquide de refroidissement', intervalMonths: 3, source: MAINTENANCE_GUIDE,
    match: /niveau.*refroidissement|refroidissement.*niveau/,
    notes: 'Vérifier le niveau selon les consignes du constructeur, moteur froid. Ce rappel concerne une vérification, pas un remplacement de liquide.' },
  { key: 'fr-brake-fluid', name: 'Niveau de liquide de frein', intervalMonths: 3, source: MAINTENANCE_GUIDE,
    match: /niveau.*frein|frein.*niveau/,
    notes: 'Vérifier le niveau conformément à la notice. Ce rappel ne remplace pas le programme d’entretien du freinage.' },
]);
const normalize = (text) => String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Seed once per vehicle. Existing controls, custom frequencies and paused reminders always win. */
export function ensureMaintenanceDefaults(garage, date) {
  let changed = false;
  const vehicles = garage.vehicles.map((vehicle) => {
    if ((vehicle.maintenanceDefaultsVersion ?? 0) >= 1) return vehicle;
    const checks = [...vehicle.maintenanceChecks ?? []];
    const electric = /electri|\belectric\b/.test(normalize(vehicle.engine ?? '')) && !/hybrid|essence|diesel|thermique/.test(normalize(vehicle.engine ?? ''));
    for (const preset of MAINTENANCE_PRESETS) {
      const id = `default-${preset.key}`;
      if (checks.some((check) => check.id === id || check.presetKey === preset.key || preset.match.test(normalize(check.name)))) continue;
      checks.push({ id, presetKey: preset.key, name: preset.name,
        ...(preset.intervalMonths ? { intervalMonths: preset.intervalMonths } : { intervalKm: preset.intervalKm }),
        firstDate: date, enabled: preset.key !== 'fr-engine-oil' || !electric, notes: preset.notes });
    }
    changed = true;
    return { ...vehicle, maintenanceChecks: checks, maintenanceDefaultsVersion: 1 };
  });
  return { changed, garage: changed ? { ...garage, vehicles } : garage };
}
