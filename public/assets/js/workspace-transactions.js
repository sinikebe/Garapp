/** Destructive workspace changes require durable recovery and persistence first. */
import { parseGarage } from './garage.js';
import { reconcileInsurance } from './insurance.js';
import { compareGarages, mergeGarages } from './backup-merge.js';
import { backupBlob } from './backups.js';
import { removeVehicle } from './vehicle-removal.js';

export async function commitImport(repository, current, incoming) {
  const parsed = parseGarage(JSON.stringify(incoming));
  const next = parseGarage(JSON.stringify(reconcileInsurance(parsed).garage));
  await repository.checkpoint(current);
  await repository.save(next);
  return next;
}

/** A durable recovery copy is required before removing a vehicle and its contents. */
export async function commitVehicleRemoval(repository, current, vehicleId, isCurrent = () => true) {
  const next = parseGarage(JSON.stringify(removeVehicle(current, vehicleId)));
  const assertCurrent = () => {
    if (!isCurrent()) throw Error('Le garage a changé depuis la confirmation. Rouvrez le véhicule avant de le supprimer.');
  };
  assertCurrent();
  await repository.checkpoint(current, 'vehicle-delete');
  assertCurrent();
  await repository.save(next);
  return next;
}

/** Keep both source copies before committing a validated field-by-field merge. */
export async function commitMerge(repository, current, incoming, choices = {}, incomingRaw = JSON.stringify(incoming)) {
  const comparison = compareGarages(current, incoming);
  const merged = mergeGarages(comparison, choices);
  const next = parseGarage(JSON.stringify(reconcileInsurance(merged).garage));
  // A combined garage can exceed limits even when each source is valid.
  backupBlob(next);
  const rawSource = parseGarage(incomingRaw);
  if (compareGarages(incoming, rawSource).differences.length) throw Error('La copie source ne correspond plus à la comparaison. Rouvrez le fichier.');
  await repository.checkpoint(current, 'merge');
  await repository.archiveRaw(incomingRaw, 'merge-source');
  await repository.save(next);
  return next;
}
