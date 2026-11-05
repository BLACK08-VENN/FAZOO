import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCampaignTeam, groupCampaignTeam } from '../apps/admin/src/lib/campaign-team.ts';

const org = '11111111-1111-4111-8111-111111111111';
const campaign = '22222222-2222-4222-8222-222222222222';
const row = {
  id: 'assignment-a', brand_ambassador_id: 'ba-a', campaign_id: campaign,
  start_date: '2026-01-01', end_date: null,
  ambassador: { id: 'ba-a', full_name: 'Sample Ambassador' },
  campaign: { id: campaign, name: 'Sample campaign' },
  store: { name: 'Sample store', organization_id: org },
};
function mockClient(campaigns, pages = [[]], error = null) {
  const calls = [];
  let page = 0;
  return {
    calls,
    from(table) {
      const filters = [];
      calls.push({ table, filters });
      const query = {
        select(value) { filters.push(['select', value]); return this; },
        eq(key, value) { filters.push(['eq', key, value]); return this; },
        in(key, value) { filters.push(['in', key, value]); return this; },
        order(key) { filters.push(['order', key]); return this; },
        range(from, to) { filters.push(['range', from, to]); return this; },
        then(resolve, reject) {
          return Promise.resolve(table === 'campaigns'
            ? { data: campaigns, error: null }
            : { data: pages[page++] ?? [], error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}
test('counts a BA once while preserving multiple store assignments', () => {
  const team = groupCampaignTeam([row, { ...row, id: 'assignment-b' }], org);
  assert.equal(team.length, 1);
  assert.equal(team[0].assignments.length, 2);
});
test('never displays a foreign-brand store', () => {
  const team = groupCampaignTeam([{ ...row, store: { name: 'Other store', organization_id: 'other' } }], org);
  assert.equal(team[0].assignments[0].store, null);
  assert.notEqual(row.store, null);
});
test('rejects malformed campaign selection before querying', async () => {
  const client = mockClient([]);
  assert.equal((await loadCampaignTeam(client, org, 'invalid')).invalidCampaign, true);
  assert.equal(client.calls.length, 0);
});
test('foreign or unavailable campaign never falls back to another campaign', async () => {
  const client = mockClient([]);
  const result = await loadCampaignTeam(client, org, campaign);
  assert.equal(result.invalidCampaign, true);
  assert.equal(client.calls.length, 1);
  assert.ok(client.calls[0].filters.some((f) => f[1] === 'organization_id' && f[2] === org));
  assert.ok(client.calls[0].filters.some((f) => f[1] === 'id' && f[2] === campaign));
});
test('assigned BAs require scoped, approved profiles and active assignments, without a log query', async () => {
  const client = mockClient([{ id: campaign, name: 'Sample campaign' }], [[row]]);
  const result = await loadCampaignTeam(client, org, campaign);
  assert.equal(result.members.length, 1);
  const filters = client.calls[1].filters;
  for (const [key, value] of [
    ['organization_id', org], ['campaign.organization_id', org],
    ['ambassador.organization_id', org], ['ambassador.role', 'brand_ambassador'],
    ['ambassador.account_status', 'approved'], ['status', 'active'],
  ]) assert.ok(filters.some((f) => f[0] === 'eq' && f[1] === key && f[2] === value));
  assert.deepEqual(filters.find((f) => f[0] === 'in'), ['in', 'campaign_id', [campaign]]);
  assert.deepEqual(client.calls.map((c) => c.table), ['campaigns', 'brand_ambassador_assignments']);
});
test('default view uses only active campaigns in the current brand', async () => {
  const client = mockClient([]);
  const result = await loadCampaignTeam(client, org);
  assert.equal(result.invalidCampaign, false);
  assert.ok(client.calls[0].filters.some((f) => f[1] === 'status' && f[2] === 'active'));
});
test('query failure is surfaced rather than reporting a zero team', async () => {
  const client = mockClient([{ id: campaign, name: 'Sample campaign' }], [[]], new Error('Unavailable'));
  await assert.rejects(loadCampaignTeam(client, org), /Unavailable/);
});
test('loads beyond one API page without losing or double-counting people', async () => {
  const page = Array.from({ length: 500 }, (_, index) => ({ ...row, id: 'assignment-' + index }));
  const client = mockClient([{ id: campaign, name: 'Sample campaign' }], [page, [{ ...row, id: 'last' }]]);
  const result = await loadCampaignTeam(client, org);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0].assignments.length, 501);
  assert.equal(client.calls.length, 3);
});
