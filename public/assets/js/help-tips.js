/** Compact explanations with click/touch/keyboard access, including inside dialogs. */
const selector = '.hint, .reference-note, [data-help]';
const skip = '[role="alert"], [role="status"], .form-error, .backup-feedback, .backup-detail, [data-model-status], [data-help-keep]';

export function initHelpTips(root = document) {
  let sequence = 0, active = null;
  const nativePopover = typeof HTMLElement.prototype.showPopover === 'function';
  const place = ({button,popup}) => {
    if (!button.isConnected || button.closest('[hidden]')) return;
    const rect = button.getBoundingClientRect(), bounds = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(12,Math.min(rect.left,innerWidth - bounds.width - 12))}px`;
    popup.style.top = `${Math.max(12,Math.min(rect.bottom + 8,innerHeight - bounds.height - 12))}px`;
  };
  const close = (restoreFocus = false) => {
    if (!active) return;
    const previous = active; active = null;
    if (nativePopover) { if (previous.popup.matches(':popover-open')) previous.popup.hidePopover(); }
    else previous.popup.hidden = true;
    previous.button.setAttribute('aria-expanded','false');
    if (restoreFocus && previous.button.isConnected) previous.button.focus();
  };
  const enhance = (element) => {
    if (!element.matches(selector) || element.matches(skip) || element.closest('.help-popup, .detail-notes, .raw-data')) return;
    if (element.querySelector(':scope > .help-trigger')) return;
    const text = element.textContent.replace(/\s+/g,' ').trim();
    if (text.length < 96 && !element.hasAttribute('data-help')) return;
    const heading = element.closest('fieldset')?.querySelector('legend') ?? element.closest('section, article, dialog')?.querySelector('h2,h3');
    const label = element.dataset.helpLabel || heading?.textContent.trim() || 'Informations complémentaires';
    const content = document.createElement('span'); content.className = 'help-content';
    content.append(...element.childNodes);
    // A single information button groups adjacent calculation-method paragraphs.
    if (element.classList.contains('stats-method')) {
      while (element.nextElementSibling?.matches('.stats-method:not([id])')) content.append(element.nextElementSibling);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'help-trigger';
    button.setAttribute('aria-label',`Informations : ${label}`); button.setAttribute('aria-expanded','false');
    button.title = 'Afficher les explications'; button.innerHTML = '<span aria-hidden="true">i</span>';
    const popup = document.createElement('span'); popup.className = 'help-popup'; popup.id = `help-tip-${++sequence}`;
    popup.setAttribute('role','note'); popup.setAttribute('aria-label',label);
    if (nativePopover) popup.setAttribute('popover','auto'); else popup.hidden = true;
    button.setAttribute('aria-controls',popup.id);
    const title = document.createElement('strong'); title.className = 'help-title'; title.textContent = label;
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'help-close';
    dismiss.setAttribute('aria-label','Fermer l’information'); dismiss.textContent = '×';
    popup.append(title,dismiss,content);
    if (element.dataset.helpSummary) { const summary = document.createElement('span'); summary.textContent = element.dataset.helpSummary; element.append(summary,' '); }
    element.append(button,popup); element.classList.add('has-help');
    const entry = {button,popup};
    button.addEventListener('click',(event) => {
      event.preventDefault(); event.stopPropagation();
      if (active === entry) return close();
      close(); active = entry; button.setAttribute('aria-expanded','true');
      if (nativePopover) popup.showPopover(); else popup.hidden = false;
      place(entry);
    });
    dismiss.addEventListener('click',(event) => { event.preventDefault(); event.stopPropagation(); close(true); });
    if (nativePopover) popup.addEventListener('toggle',(event) => {
      if (event.newState === 'closed') { button.setAttribute('aria-expanded','false'); if (active === entry) active = null; }
    });
  };
  const scan = (node) => {
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!node || node.closest?.('.help-popup')) return;
    if (node.matches?.(selector)) enhance(node);
    node.querySelectorAll?.(selector).forEach(enhance);
  };
  scan(root);
  const observer = new MutationObserver((mutations) => {
    if (active && (!active.button.isConnected || active.button.closest('[hidden]'))) close();
    for (const mutation of mutations) {
      if (mutation.type === 'childList') { scan(mutation.target); for (const node of mutation.addedNodes) scan(node); }
      else if (mutation.type === 'characterData') scan(mutation.target);
    }
  });
  observer.observe(root === document ? document.body : root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  document.addEventListener('pointerdown',(event) => { if (active && !active.popup.contains(event.target) && !active.button.contains(event.target)) close(); });
  document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); close(true); } },true);
  window.addEventListener('resize',() => { if (active) place(active); });
  window.addEventListener('scroll',() => { if (active) place(active); },true);
  window.addEventListener('hashchange',() => close());
}
