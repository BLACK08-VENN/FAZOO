import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  initialSession,
  sessionSchema,
  products,
  outlets,
  type Command,
  type DemoData,
  type Role,
} from './model';

describe('Hanan fictional demo workflows', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const run = (
    d: DemoData,
    role: Role,
    command: Command,
    id = crypto.randomUUID(),
  ) => applyCommand(d, { id, role, command }, now);
  const gap = () => ({
    action: 'gap' as const,
    outlet: outlets[2],
    product: products[2],
    priority: 'High' as const,
    note: 'Fictional shelf gap',
  });
  it('validates the complete stored demo session', () => {
    expect(sessionSchema.parse(initialSession(now)).version).toBe(1);
  });
  it('automatically opens one gap from a zero-stock shelf check', () => {
    const c = {
      action: 'check' as const,
      outlet: outlets[2],
      product: products[2],
      stock: 0,
      price: 100,
      display: 'Needs attention' as const,
      note: 'Fictional empty shelf',
      photo: null,
    };
    let d = run(initialSession(now).data, 'Field worker', c);
    d = run(d, 'Field worker', c);
    expect(d.checks).toHaveLength(2);
    expect(d.gaps.filter((g) => g.outlet === outlets[2])).toHaveLength(1);
  });
  it('does not open a gap for stocked shelves', () => {
    const d = run(initialSession(now).data, 'Field worker', {
      action: 'check',
      outlet: outlets[2],
      product: products[2],
      stock: 5,
      price: 100,
      display: 'Meets standard',
      note: 'Shelf is stocked',
      photo: null,
    });
    expect(d.gaps).toHaveLength(2);
  });
  it('replays the same operation without duplicating records', () => {
    const id = crypto.randomUUID();
    const d = run(initialSession(now).data, 'Field worker', gap(), id);
    expect(run(d, 'Field worker', gap(), id)).toBe(d);
    expect(() => run(d, 'Manager', gap(), id)).toThrow(/another submission/);
  });
  it('does not mutate the previous state', () => {
    const d = initialSession(now).data;
    run(d, 'Field worker', gap());
    expect(d.gaps).toHaveLength(2);
  });
  it('rejects duplicate active stock gaps', () => {
    const d = run(initialSession(now).data, 'Field worker', gap());
    expect(() => run(d, 'Field worker', gap())).toThrow(/already exists/);
  });
  it('requires manager assignment and independent follow-up review', () => {
    let d = initialSession(now).data;
    const target = d.gaps[0]!.id;
    expect(() =>
      run(d, 'Field worker', {
        action: 'assign',
        target,
        dueAt: new Date(now + 86400000).toISOString(),
      }),
    ).toThrow(/Manager/);
    expect(() =>
      run(d, 'Field worker', {
        action: 'resolve',
        target,
        note: 'Replenished demo shelf',
      }),
    ).toThrow(/assign/);
    d = run(d, 'Manager', {
      action: 'assign',
      target,
      dueAt: new Date(now + 86400000).toISOString(),
    });
    expect(() =>
      run(d, 'Manager', {
        action: 'resolve',
        target,
        note: 'Replenished demo shelf',
      }),
    ).toThrow(/Field worker/);
    d = run(d, 'Field worker', {
      action: 'resolve',
      target,
      note: 'Replenished demo shelf',
    });
    expect(() =>
      run(d, 'Field worker', {
        action: 'review',
        target,
        approve: true,
        note: 'Reviewed demo evidence',
      }),
    ).toThrow(/Manager/);
    d = run(d, 'Manager', {
      action: 'review',
      target,
      approve: true,
      note: 'Reviewed demo evidence',
    });
    expect(d.gaps[0]!.status).toBe('Resolved');
  });
  it('rejects past follow-up deadlines', () => {
    const d = initialSession(now).data;
    expect(() =>
      run(d, 'Manager', {
        action: 'assign',
        target: d.gaps[0]!.id,
        dueAt: new Date(now - 1).toISOString(),
      }),
    ).toThrow(/future/);
  });
  it('can return a submitted resolution for further work', () => {
    let d = initialSession(now).data;
    const target = d.gaps[1]!.id;
    d = run(d, 'Field worker', {
      action: 'resolve',
      target,
      note: 'Demo completion summary',
    });
    d = run(d, 'Manager', {
      action: 'review',
      target,
      approve: false,
      note: 'Please check the display',
    });
    expect(d.gaps[1]!.status).toBe('Assigned');
  });
  it('requires a matching gap for a linked order', () => {
    const d = initialSession(now).data;
    expect(() =>
      run(d, 'Field worker', {
        action: 'order',
        outlet: outlets[2],
        product: products[2],
        gapId: d.gaps[0]!.id,
        quantity: 12,
        note: 'Demo order request',
      }),
    ).toThrow(/match/);
  });
  it('prevents duplicate pending orders and does not auto-close a gap on receipt', () => {
    let d = initialSession(now).data;
    const c = {
      action: 'order' as const,
      outlet: outlets[0],
      product: products[0],
      gapId: d.gaps[0]!.id,
      quantity: 12,
      note: 'Demo order request',
    };
    d = run(d, 'Field worker', c);
    const target = d.orders[0]!.id;
    expect(() => run(d, 'Field worker', c)).toThrow(/already exists/);
    expect(() =>
      run(d, 'Field worker', {
        action: 'advanceOrder',
        target,
        note: 'Approve demo order',
      }),
    ).toThrow(/Manager/);
    d = run(d, 'Manager', {
      action: 'advanceOrder',
      target,
      note: 'Approve demo order',
    });
    d = run(d, 'Manager', {
      action: 'advanceOrder',
      target,
      note: 'Demo dispatch recorded',
    });
    expect(() =>
      run(d, 'Manager', {
        action: 'advanceOrder',
        target,
        note: 'Demo receipt recorded',
      }),
    ).toThrow(/Field worker/);
    d = run(d, 'Field worker', {
      action: 'advanceOrder',
      target,
      note: 'Demo receipt recorded',
    });
    expect(d.orders[0]!.status).toBe('Received');
    expect(d.gaps[0]!.status).toBe('Open');
  });
  it('records dated competitor intelligence', () => {
    const d = run(initialSession(now).data, 'Field worker', {
      action: 'competitor',
      outlet: outlets[0],
      category: products[0],
      competitor: 'Demo competitor',
      price: 120,
      promotion: 'Fictional bundle promotion',
    });
    expect(d.observations[0]!.createdAt).toBe(new Date(now).toISOString());
  });
  it('requires the full service sequence and advances the recurring due date only on approval', () => {
    let d = initialSession(now).data;
    const target = d.assets[0]!.id;
    expect(() =>
      run(d, 'Technician', {
        action: 'service',
        target,
        step: 'Submit',
        note: 'Completed inspection',
      }),
    ).toThrow(/sequence/);
    const before = d.assets[0]!.nextDue;
    d = run(d, 'Manager', {
      action: 'service',
      target,
      step: 'Assign',
      note: 'Assigned demo technician',
    });
    d = run(d, 'Technician', {
      action: 'service',
      target,
      step: 'Start',
      note: 'Started inspection',
    });
    d = run(d, 'Technician', {
      action: 'service',
      target,
      step: 'Submit',
      note: 'Completed inspection',
    });
    expect(d.assets[0]!.nextDue).toBe(before);
    expect(() =>
      run(d, 'Technician', {
        action: 'service',
        target,
        step: 'Approve',
        note: 'Approve inspection',
      }),
    ).toThrow(/Manager/);
    d = run(d, 'Manager', {
      action: 'service',
      target,
      step: 'Approve',
      note: 'Approve inspection',
    });
    expect(d.assets[0]!.status).toBe('Scheduled');
    expect(Date.parse(d.assets[0]!.nextDue)).toBe(now + 30 * 86400000);
    expect(d.assets[0]!.history).toHaveLength(4);
  });
  it('rejects invalid quantities and technician retail submissions', () => {
    expect(() =>
      run(initialSession(now).data, 'Manager', {
        action: 'order',
        outlet: outlets[0],
        product: products[0],
        quantity: 0,
        gapId: null,
        note: 'Demo request',
      }),
    ).toThrow();
    expect(() => run(initialSession(now).data, 'Technician', gap())).toThrow(
      /Field worker/,
    );
  });
});
