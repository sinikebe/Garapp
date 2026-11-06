import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleGarage, parseGarage, componentLife, componentHistory, recordTotal, vehicleStats, moneyInput, storageKey } from '../public/assets/js/garage.js';
import { suiteLinks } from '../public/assets/js/app-switcher.js';

const date = '2026-11-06';
test('the fictional garage round-trips with complete intervention/component relations', () => {
  const garage = exampleGarage(date);
  assert.deepEqual(parseGarage(JSON.stringify(garage)), garage);
  const vehicle = garage.vehicles[0];
  assert.equal(componentHistory(vehicle, 'oil')[0].id, 'service');
  assert.equal(componentHistory(vehicle, 'cabin')[0].id, 'service');
  assert.equal(componentHistory(vehicle, 'brakes')[0].id, 'pads');
});

test('each intervention is counted once even when it replaces several components', () => {
  const vehicle = exampleGarage(date).vehicles[0];
  const stats = vehicleStats(vehicle, '2026');
  assert.equal(stats.total, 51500);
  assert.equal(stats.parts + stats.labor, stats.total);
  assert.equal(stats.categories.reduce((sum, one) => sum + one.total, 0), stats.total);
  assert.equal(stats.count, 3);
  assert.equal(recordTotal(vehicle.records.find((one) => one.id === 'service')), 18900);
});

test('the first reached time or distance interval governs the planning reference', () => {
  const vehicle = exampleGarage(date).vehicles[0];
  const oil = vehicle.components.find((one) => one.id === 'oil');
  const life = componentLife(vehicle, oil, date);
  assert.equal(life.km, 2600);
  assert.equal(life.status, 'soon');
  assert.equal(componentLife({ ...vehicle, odometer: 132000 }, oil, date).status, 'due');
  assert.equal(componentLife(vehicle, oil, '2027-04-06').status, 'due');
  assert.equal(componentLife(vehicle, { ...oil, intervalKm: null, intervalMonths: null }, date).percent, null);
});

test('a new replacement uses the date and mileage of that same intervention', () => {
  const vehicle = exampleGarage(date).vehicles[0];
  const part = vehicle.components[0];
  vehicle.records.push({ id: 'new', title: 'Nouvelle vidange', type: 'entretien', date, odometer: 128400, partsAmount: '75', laborAmount: '50', componentIds: ['oil'], notes: '' });
  const original = structuredClone(vehicle);
  const life = componentLife(vehicle, part, date);
  assert.equal(life.last.id, 'new');
  assert.equal(life.km, 15000);
  assert.equal(life.percent, 100);
  assert.deepEqual(vehicle, original);
});

test('calendar anniversaries and month ends do not gain an extra month', () => {
  const vehicle = exampleGarage(date).vehicles[0];
  assert.equal(componentLife(vehicle, vehicle.components.find((one) => one.id === 'belt'), date).months, 12);
  const part = { id: 'leap', name: 'Pièce', intervalKm: null, intervalMonths: 12 };
  const leapVehicle = { odometer: 1000, records: [{ id: 'install', date: '2024-02-29', odometer: 1000, componentIds: ['leap'] }] };
  assert.equal(componentLife(leapVehicle, part, '2025-02-28').status, 'due');
});

test('backups reject broken relations, duplicate IDs, impossible dates and invalid money', () => {
  for (const corrupt of [
    (vehicle) => { vehicle.records[0].componentIds = ['missing']; },
    (vehicle) => { vehicle.records[0].date = '2026-02-30'; },
    (vehicle) => { vehicle.records[0].laborAmount = 'not-an-amount'; },
    (vehicle) => { vehicle.records[0].partsAmount = 7900; },
    (vehicle) => { vehicle.records[0].odometer = -1; },
    (vehicle) => { vehicle.components[1].id = vehicle.components[0].id; },
  ]) {
    const garage = exampleGarage(date);
    corrupt(garage.vehicles[0]);
    assert.throws(() => parseGarage(JSON.stringify(garage)));
  }
  assert.throws(() => parseGarage('{'));
  assert.throws(() => parseGarage('x'.repeat(2000001)));
});

test('French amounts are stored as exact cents rather than partially parsed', () => {
  for (const [value, cents] of [['1 234,56', 123456], ['0,10', 10], ['19.99', 1999], ['0', 0]]) assert.equal(moneyInput(value), cents);
  for (const value of ['-1', '12abc', '1,2,3', '', '1.234', 'Infinity']) assert.equal(moneyInput(value), null);
});

test('Garapp keeps main and dev storage separate and outside Finapp keys', () => {
  const main = storageKey('https://sinikebe.github.io/Garapp/');
  const dev = storageKey('https://sinikebe.github.io/Garapp/dev/');
  assert.notEqual(main, dev);
  assert.ok(main.startsWith('garapp.'));
  assert.ok(dev.endsWith('/Garapp/dev/'));
});

test('the app launcher pairs main with main and dev with dev on both apps', () => {
  for (const app of ['finapp', 'Garapp']) {
    for (const suffix of ['', 'dev/']) {
      const links = suiteLinks(`https://sinikebe.github.io/${app}/${suffix}`);
      assert.equal(links.preview, Boolean(suffix));
      assert.deepEqual(links.apps.map((one) => one.href), [`https://sinikebe.github.io/finapp/${suffix}`, `https://sinikebe.github.io/Garapp/${suffix}`]);
    }
  }
  assert.deepEqual(suiteLinks('http://localhost:4173/Garapp/dev/index.html').apps.map((one) => one.href), ['http://localhost:4173/finapp/dev/', 'http://localhost:4173/Garapp/dev/']);
});
