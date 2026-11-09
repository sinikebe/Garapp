/** An import becomes visible only after both recovery and replacement are durable. */
import { parseGarage } from './garage.js';
import { reconcileInsurance } from './insurance.js';

export async function commitImport(repository, current, incoming) {
  const parsed = parseGarage(JSON.stringify(incoming));
  const next = parseGarage(JSON.stringify(reconcileInsurance(parsed).garage));
  await repository.checkpoint(current);
  await repository.save(next);
  return next;
}
