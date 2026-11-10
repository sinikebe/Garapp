/** Confirm one vehicle removal without changing the garage before persistence succeeds. */
export class VehicleRemovalPanel {
  constructor({ dialog, getGarage, remove, showDialog, onRemoved = () => {} }) {
    Object.assign(this, { dialog, getGarage, remove, showDialog, onRemoved });
    this.description = dialog.querySelector('#vehicle-delete-description');
    this.error = dialog.querySelector('#vehicle-delete-error');
    this.pending = null;
    this.busy = false;
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.confirm();
    });
    dialog.addEventListener('cancel', (event) => { if (this.busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { if (!this.busy) this.pending = null; });
  }

  open(vehicleId) {
    if (this.busy) return;
    const garage = this.getGarage();
    const vehicle = garage.vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;
    this.pending = { garage, vehicleId };
    this.description.textContent = `« ${vehicle.name} » sera retiré du garage avec ses interventions, composants, assurances et documents.`;
    this.error.hidden = true;
    this.error.textContent = '';
    this.showDialog(this.dialog.id);
    this.dialog.querySelector('#vehicle-delete-cancel').focus();
  }

  async confirm() {
    if (this.busy || !this.pending) return;
    const target = this.pending;
    const buttons = [...this.dialog.querySelectorAll('button')].map((button) => [button, button.disabled]);
    this.busy = true;
    for (const [button] of buttons) button.disabled = true;
    this.error.hidden = true;
    try {
      await this.remove(target.garage, target.vehicleId);
    } catch (error) {
      this.error.textContent = `Suppression impossible. ${error.message}`;
      this.error.hidden = false;
      return;
    } finally {
      this.busy = false;
      for (const [button, disabled] of buttons) button.disabled = disabled;
    }
    this.pending = null;
    this.dialog.close();
    this.onRemoved();
  }
}
