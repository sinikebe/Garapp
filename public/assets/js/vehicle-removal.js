/** Remove one complete vehicle without changing the remaining garage data. */
export function removeVehicle(garage, vehicleId) {
  const next = structuredClone(garage);
  const index = next.vehicles.findIndex((vehicle) => vehicle.id === vehicleId);
  if (index < 0) throw Error('Ce véhicule est introuvable. Aucun véhicule n’a été supprimé.');
  next.vehicles.splice(index, 1);
  if (next.activeId === vehicleId) next.activeId = next.vehicles[Math.min(index, next.vehicles.length - 1)]?.id ?? null;
  return next;
}
