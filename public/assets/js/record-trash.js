/** Move entire records without changing their content or mutating the open garage. */
import { isTimestamp } from './garage.js';

function copyVehicle(garage, vehicleId) {
  const next = structuredClone(garage);
  const vehicle = next.vehicles.find((one) => one.id === vehicleId);
  if (!vehicle) throw Error('Le véhicule est introuvable. Aucune fiche n’a été modifiée.');
  return { next, vehicle };
}

export function moveRecordToTrash(garage, vehicleId, recordId, deletedAt = new Date().toISOString()) {
  if (!isTimestamp(deletedAt)) throw Error('La date de suppression est invalide.');
  const { next, vehicle } = copyVehicle(garage, vehicleId);
  const position = vehicle.records.findIndex((record) => record.id === recordId);
  if (position < 0 || vehicle.trashedRecords?.some((entry) => entry.record.id === recordId)) throw Error('Cette fiche a changé ou se trouve déjà dans la corbeille.');
  const [record] = vehicle.records.splice(position, 1);
  (vehicle.trashedRecords ??= []).push({ record, deletedAt, position });
  return next;
}

export function restoreTrashedRecord(garage, vehicleId, recordId) {
  const { next, vehicle } = copyVehicle(garage, vehicleId);
  const index = vehicle.trashedRecords?.findIndex((entry) => entry.record.id === recordId) ?? -1;
  if (index < 0) throw Error('Cette fiche ne se trouve plus dans la corbeille.');
  if (vehicle.records.some((record) => record.id === recordId)) throw Error('Une fiche active utilise déjà cet identifiant. La copie de la corbeille est conservée.');
  const [entry] = vehicle.trashedRecords.splice(index, 1);
  vehicle.records.splice(Math.min(entry.position ?? vehicle.records.length, vehicle.records.length), 0, entry.record);
  return next;
}

/** Only an explicit permanent deletion removes the record and its embedded files. */
export function discardTrashedRecord(garage, vehicleId, recordId) {
  const { next, vehicle } = copyVehicle(garage, vehicleId);
  const index = vehicle.trashedRecords?.findIndex((entry) => entry.record.id === recordId) ?? -1;
  if (index < 0) throw Error('Cette fiche ne se trouve plus dans la corbeille.');
  vehicle.trashedRecords.splice(index, 1);
  return next;
}
