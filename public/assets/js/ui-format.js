/** Shared presentation helpers. Domain values are never changed for display. */
const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const numbers = new Intl.NumberFormat('fr-FR');

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => htmlEntities[character]);
export const formatNumber = (value) => value == null ? 'Non renseigné' : numbers.format(value);
export const formatMileage = (value) => value == null ? 'Kilométrage inconnu' : `${formatNumber(value)} km`;

/** A calendar date must not move to the next day in a different time zone. */
export function formatDate(date, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })
    : 'Date inconnue';
}

export const icon = (name) => `<svg class="icon ui-icon" aria-hidden="true"><use href="#i-${escapeHtml(name)}"/></svg>`;
