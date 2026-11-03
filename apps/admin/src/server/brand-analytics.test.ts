import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  attendanceMix,
  baPerformance,
  campaignPerformance,
  campaignTimeline,
  skuBreakdown,
  storeActivity,
  storePerformance,
  summarizeLogs,
  toActivityLogs,
  trendFromLogs,
  weekdayActivity,
  type BrandBa,
  type BrandCampaign,
  type BrandLog,
  type BrandStore,
} from './brand-analytics';

function log(overrides: Partial<BrandLog> = {}): BrandLog {
  return {
    id: 'log-1',
    campaign_id: 'campaign-1',
    campaign_name: 'Campaign One',
    ba_id: 'ba-1',
    ba_name: 'Ada Example',
    store_id: 'store-1',
    store_name: 'Store One',
    attendance_date: '2026-10-01',
    attendance_status: 'present',
    status: 'completed',
    flagged: false,
    checkin_at: '2026-10-01T08:00:00Z',
    checkout_at: '2026-10-01T17:00:00Z',
    units: 10,
    skus: [{ name: 'Widget', quantity: 10 }],
    ...overrides,
  };
}

const campaign: BrandCampaign = {
  id: 'campaign-1',
  name: 'Campaign One',
  description: null,
  status: 'active',
  start_date: '2026-10-01',
  end_date: '2026-10-10',
};

const ba: BrandBa = {
  id: 'ba-1',
  full_name: 'Ada Example',
  phone: '+2348031234567',
  profile_photo_path: null,
};

const store: BrandStore = {
  id: 'store-1',
  name: 'Store One',
  address: 'Lagos',
  status: 'active',
};

describe('summarizeLogs', () => {
  it('totals sales, reporting and attendance without counting weekly off as accountable', () => {
    const summary = summarizeLogs([
      log(),
      log({
        id: 'log-2',
        attendance_date: '2026-10-02',
        attendance_status: 'sick_leave',
        status: 'open',
        units: 0,
        skus: [],
      }),
      log({
        id: 'log-3',
        attendance_date: '2026-10-03',
        attendance_status: 'absent',
        status: 'open',
        flagged: true,
        units: 0,
        skus: [],
      }),
      log({
        id: 'log-4',
        attendance_date: '2026-10-04',
        attendance_status: 'weekly_off',
        status: 'open',
        units: 0,
        skus: [],
      }),
    ]);

    expect(summary).toMatchObject({
      logs: 4,
      completed: 1,
      open: 3,
      present: 1,
      sickLeave: 1,
      absent: 1,
      weeklyOff: 1,
      flagged: 1,
      units: 10,
      completionRate: 25,
      attendanceRate: 33,
    });
  });
});

describe('campaignTimeline', () => {
  it('reports elapsed progress for a live campaign', () => {
    expect(campaignTimeline(campaign, '2026-10-05')).toEqual({
      phase: 'live',
      totalDays: 10,
      daysLeft: 5,
      elapsedPct: 50,
    });
  });

  it('marks a campaign that has not started as upcoming', () => {
    expect(campaignTimeline(campaign, '2026-09-29')).toEqual({
      phase: 'upcoming',
      totalDays: 10,
      daysLeft: 2,
      elapsedPct: 0,
    });
  });

  it('marks a campaign after its end date as ended', () => {
    expect(campaignTimeline(campaign, '2026-10-12')).toEqual({
      phase: 'ended',
      totalDays: 10,
      daysLeft: 0,
      elapsedPct: 100,
    });
  });

  it('does not invent an end date for open campaigns', () => {
    expect(campaignTimeline({ ...campaign, end_date: null }, '2026-10-12')).toEqual({
      phase: 'live',
      totalDays: null,
      daysLeft: null,
      elapsedPct: 0,
    });
  });
});

describe('grouped performance', () => {
  it('groups campaign activity and coverage', () => {
    const [row] = campaignPerformance(
      [campaign],
      [
        log(),
        log({ id: 'log-2', ba_id: 'ba-2', ba_name: 'Bola Example', attendance_date: '2026-10-02' }),
        log({
          id: 'log-3',
          ba_id: 'ba-2',
          ba_name: 'Bola Example',
          attendance_date: '2026-10-03',
          store_id: 'store-2',
          store_name: 'Store Two',
        }),
      ],
    );

    if (!row) throw new Error('expected campaign performance row');
    expect(row).toMatchObject({ campaign, logs: 3, present: 3, units: 30, bas: 2, stores: 2 });
    expect(row.lastActive).toBe('2026-10-03');
  });

  it('lists approved ambassadors with no activity and sorts by units', () => {
    const rows = baPerformance(
      [ba, { ...ba, id: 'ba-2', full_name: 'Bola Example' }],
      [log(), log({ id: 'log-2', ba_id: 'ba-2', ba_name: 'Bola Example', units: 20 })],
    );

    expect(rows.map((row) => [row.ba.full_name, row.units])).toEqual([
      ['Bola Example', 20],
      ['Ada Example', 10],
    ]);
  });

  it('uses only present days for a store last visit', () => {
    const [row] = storePerformance(
      [store],
      [
        log(),
        log({
          id: 'log-2',
          attendance_date: '2026-10-05',
          attendance_status: 'sick_leave',
          status: 'open',
          units: 0,
          skus: [],
        }),
      ],
    );

    if (!row) throw new Error('expected store performance row');
    expect(row.lastVisit).toBe('2026-10-01');
    expect(row.present).toBe(1);
  });
});

describe('reporting helpers', () => {
  it('sums SKU quantities across logs', () => {
    expect(
      skuBreakdown([
        log({ skus: [{ name: 'Widget', quantity: 3 }] }),
        log({ id: 'log-2', skus: [{ name: 'Gadget', quantity: 2 }, { name: 'Widget', quantity: 4 }] }),
      ]),
    ).toEqual([
      { name: 'Widget', quantity: 7 },
      { name: 'Gadget', quantity: 2 },
    ]);
  });

  it('builds a day-by-day trend', () => {
    expect(
      trendFromLogs([
        log(),
        log({ id: 'log-2', status: 'open', units: 5 }),
        log({ id: 'log-3', attendance_date: '2026-10-02', units: 7 }),
      ]),
    ).toEqual([
      { day: '2026-10-01', units: 15, completionPct: 50 },
      { day: '2026-10-02', units: 7, completionPct: 100 },
    ]);
  });
});

describe('attendanceMix', () => {
  it('reports counts and percentages for each attendance state', () => {
    const mix = attendanceMix([
      log(),
      log({ id: 'log-2', attendance_status: 'present', units: 5 }),
      log({ id: 'log-3', attendance_status: 'sick_leave', units: 0, skus: [] }),
      log({ id: 'log-4', attendance_status: 'absent', units: 0, skus: [] }),
      log({ id: 'log-5', attendance_status: 'weekly_off', units: 0, skus: [] }),
    ]);

    expect(mix).toEqual({
      present: 2,
      sickLeave: 1,
      absent: 1,
      weeklyOff: 1,
      total: 5,
      presentPct: 40,
      sickLeavePct: 20,
      absentPct: 20,
      weeklyOffPct: 20,
    });
  });
});

describe('weekdayActivity', () => {
  it('buckets visits and units by weekday', () => {
    const points = weekdayActivity([
      log({ attendance_date: '2026-10-01', units: 10 }),
      log({ id: 'log-2', attendance_date: '2026-10-01', units: 4 }),
      log({ id: 'log-3', attendance_date: '2026-10-04', units: 7 }),
      log({ id: 'log-4', attendance_date: '2026-10-05', attendance_status: 'absent', units: 2 }),
    ]);

    expect(points).toHaveLength(7);
    expect(points.find((point) => point.day === 'Thu')).toEqual({
      day: 'Thu',
      visits: 2,
      units: 14,
    });
    expect(points.find((point) => point.day === 'Sun')).toEqual({
      day: 'Sun',
      visits: 1,
      units: 7,
    });
    expect(points.find((point) => point.day === 'Mon')).toEqual({
      day: 'Mon',
      visits: 0,
      units: 2,
    });
  });
});

describe('storeActivity', () => {
  it('ranks stores by present visits then units', () => {
    const rows = storeActivity([
      log(),
      log({ id: 'log-2' }),
      log({ id: 'log-3', store_id: 'store-2', store_name: 'Store Two', units: 30 }),
    ]);

    expect(rows[0]).toMatchObject({ id: 'store-1', visits: 2, units: 20 });
    expect(rows[1]).toMatchObject({ id: 'store-2', visits: 1, units: 30 });
  });
});

describe('toActivityLogs', () => {
  it('removes field-worker identifiers before client rendering', () => {
    const [row] = toActivityLogs([log()]);

    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('ba_id');
    expect(row).not.toHaveProperty('ba_name');
    expect(row).toMatchObject({ id: 'log-1', store_name: 'Store One', units: 10 });
  });
});
