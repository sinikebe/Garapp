import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, TYPES } from '../public/assets/js/garage.js';
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

test('journal fuel rows identify volumes, fill states and actual unit prices without inventing missing data', () => {
  const current = parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records: [
    { id: 'full', type: 'fuel', title: 'Plein fictif <test>', date: '2026-01-04', odometer: 12500, fuel: { litres: '42.5', fullTank: true }, totalAmount: '76.5' },
    { id: 'partial', type: 'fuel', title: 'Ajout fictif', date: '2026-01-03', fuel: { litres: '10', fullTank: false }, totalAmount: '0' },
    { id: 'unknown', type: 'fuel', title: 'Données fictives incomplètes' },
  ] }] })).vehicles[0];
  const snapshot = structuredClone(current), html = recordsMarkup(current.records, current);
  assert.match(html, /record-row-fuel/);
  assert.match(html, /#i-fuel/);
  assert.match(html, /42,5 L/);
  assert.match(html, /Plein complet/);
  assert.match(html, /Ajout partiel/);
  assert.match(html, /1,800 €\/L/);
  assert.match(html, /0,000 €\/L/);
  assert.match(html, /Quantité inconnue/);
  assert.match(html, /Prix au litre inconnu/);
  assert.match(html, /Remplissage non précisé/);
  assert.match(html, /Plein fictif &lt;test&gt;/);
  assert.doesNotMatch(html, /NaN|Infinity|<test>/);
  assert.deepEqual(current, snapshot);
});

test('journal identities distinguish all event kinds and keep readings focused on mileage', () => {
  const current = parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records: Object.keys(TYPES).filter(type => type !== 'fuel').map((type) => ({
    id: type, type, title: `Événement fictif ${type}`, date: '2026-01-04', odometer: type === 'reading' ? 0 : null,
    totalAmount: type === 'reading' ? null : '12.345', status: type === 'plan' ? 'planned' : 'done',
  })) }] })).vehicles[0];
  const snapshot = structuredClone(current), html = recordsMarkup(current.records, current);
  for (const type of Object.keys(TYPES).filter(type => type !== 'fuel')) assert.ok(html.includes(`data-event-kind="${type}"`));
  assert.match(html, /Programme de suivi/);
  assert.match(html, /Budget/);
  assert.match(html, /Prévu/);
  assert.match(html, /Cotisation ponctuelle/);
  assert.match(html, /Transaction du véhicule/);
  const reading = html.match(/<article[^>]*data-event-kind="reading"[\s\S]*?<\/article>/)?.[0];
  assert.match(reading, /0 km/);
  assert.match(reading, /#i-gauge/);
  assert.doesNotMatch(reading, /Non renseigné|€|Montant/);
  assert.deepEqual(current, snapshot);
});

test('linked insurance context and unknown event types remain escaped and retain their source values', () => {
  const current = vehicle();
  current.records[0].type = 'insurance';
  current.records[0].insurance = { contractId: 'policy', period: '2026-01' };
  current.insurances = [{ id: 'policy', provider: 'Assureur fictif <test>' }];
  current.records[1].type = 'legacy" onmouseover="bad';
  const snapshot = structuredClone(current), html = recordsMarkup(current.records, current);
  assert.match(html, /Assureur fictif &lt;test&gt;/);
  assert.match(html, /Cotisation de janvier 2026/);
  assert.match(html, /data-event-kind="other"/);
  assert.match(html, /legacy&quot; onmouseover=&quot;bad/);
  assert.doesNotMatch(html, /onmouseover="bad|<test>/);
  assert.deepEqual(current, snapshot);
});
