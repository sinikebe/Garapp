/** Shared behavior for header disclosures, including keyboard focus recovery. */
export function initHeaderMenus(root = document) {
  const menus = [...root.querySelectorAll('[data-header-menu]')];
  const trigger = (menu) => menu.querySelector('summary');
  const close = (menu, restoreFocus = false) => {
    if (!menu.open) return;
    menu.open = false;
    if (restoreFocus) trigger(menu).focus({ preventScroll: true });
  };
  for (const menu of menus) menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of menus) if (other !== menu) close(other);
  });
  root.addEventListener('click', (event) => {
    for (const menu of menus) {
      if (!menu.open || menu.contains(event.target)) continue;
      const focusInside = menu.contains(root.activeElement);
      const nextControl = event.target.closest?.('a, button, input, select, textarea, summary, [tabindex]');
      close(menu, focusInside && !nextControl);
    }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = menus.find((menu) => menu.open);
    if (!open) return;
    event.preventDefault();
    close(open, true);
  });
  return () => menus.forEach((menu) => close(menu));
}
