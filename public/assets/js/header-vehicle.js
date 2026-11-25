/** Keep one vehicle selector and move it into Tools only when the header is full. */
export function initHeaderVehicle(root = document) {
  const header = root.querySelector('.app-bar');
  const slot = header.querySelector('[data-vehicle-slot]');
  const menuSlot = header.querySelector('[data-vehicle-menu-slot]');
  const picker = slot.querySelector('.vehicle-picker');
  const brand = header.querySelector('.brand');
  const actions = header.querySelector('.app-bar-actions');
  const menu = menuSlot.closest('details');
  const view = root.defaultView;
  const update = () => {
    const style = view.getComputedStyle(header);
    const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      - brand.getBoundingClientRect().width - actions.getBoundingClientRect().width - 2 * parseFloat(style.columnGap);
    const fits = available >= parseFloat(view.getComputedStyle(slot).minWidth);
    const destination = fits ? slot : menuSlot;
    if (picker.parentElement === destination) return;
    const focused = picker.contains(root.activeElement) ? root.activeElement : null;
    destination.append(picker);
    slot.hidden = !fits; menuSlot.hidden = fits;
    if (focused) {
      if (!fits) menu.open = true;
      focused.focus({ preventScroll: true });
    }
  };
  update();
  const observer = new view.ResizeObserver(update);
  for (const target of [header, brand, actions]) observer.observe(target);
  return () => observer.disconnect();
}
