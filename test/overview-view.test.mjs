import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { dashboardMarkup, recordsMarkup, expensesMarkup } from '../public/assets/js/overview-view.js';
import { escapeHtml, formatDate, formatMileage, icon } from '../public/assets/js/ui-format.js';

const vehicle = () => parseGarage(JSON.stringify({ version: 2, vehicles: [{
  id: 'example', name: 'Véhicule fictif <test>', odometer: 0, components: [],
  records: [
    { id: 'known', title: '<img src=x onerror=alert(1)>', type: 'repair', date: '2026-03-02', totalAmount: '12.345' },
    { id: 'unknown', title: 'Fiche fictive sans date', type: 'repair' },
  ],
}] })).vehicles[0];

test('overview renderers retain input, unknown amounts and escaped user text', () => {
  const current = vehicle(), original = structuredClone(current);
  const records = recordsMarkup(current.records, current);
  assert.match(records, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(records, /<img/);
  assert.match(records, /Non renseigné/);
  assert.match(records, /Date inconnue/);
  assert.ok(records.indexOf('data-record="known"') < records.indexOf('data-record="unknown"'));
  const dashboard = dashboardMarkup(current, '2026-04-01');
  assert.match(dashboard, /Véhicule fictif &lt;test&gt;/);
  assert.match(dashboard, /Interventions en 2026/);
  assert.match(dashboard, /class="odometer-value">0 <small>km<\/small>/);
  assert.match(expensesMarkup(current, { period: 'all' }), /12,35/);
  assert.deepEqual(current, original);
});

test('presentation helpers escape attribute text and preserve calendar dates', () => {
  assert.equal(escapeHtml('"<&\''), '&quot;&lt;&amp;&#39;');
  assert.doesNotMatch(icon('x" onload="bad'), /onload="bad/);
  assert.equal(formatMileage(null), 'Kilométrage inconnu');
  assert.equal(formatMileage(0), '0 km');
  const expected = new Date('2026-03-02T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  assert.equal(formatDate('2026-03-02', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Kiritimati' }), expected);
});
