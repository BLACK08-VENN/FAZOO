import { z } from 'zod';

export const products = [
  'Case-study tissue pack',
  'Case-study wipes pack',
  'Case-study kitchen roll',
] as const;
export const outlets = [
  'Demo outlet A',
  'Demo outlet B',
  'Demo outlet C',
] as const;
export const roles = ['Manager', 'Field worker', 'Technician'] as const;
export type Role = (typeof roles)[number];
const text = z.string().trim().min(3).max(600);
const date = z.iso.datetime();
const product = z.enum(products);
const outlet = z.enum(outlets);
const priority = z.enum(['Normal', 'High', 'Urgent']);
const photo = z
  .string()
  .max(180000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
  .nullable();
const gapSchema = z.object({
  id: z.string(),
  outlet,
  product,
  priority,
  note: text,
  status: z.enum(['Open', 'Assigned', 'For review', 'Resolved']),
  assigned: z.boolean(),
  dueAt: date.nullable(),
  resolution: z.string(),
  createdAt: date,
});
const orderSchema = z.object({
  id: z.string(),
  gapId: z.string().nullable(),
  outlet,
  product,
  quantity: z.number().int().min(1).max(10000),
  status: z.enum(['Requested', 'Approved', 'Dispatched', 'Received']),
  note: z.string(),
  createdAt: date,
});
const assetSchema = z.object({
  id: z.string(),
  name: text,
  location: text,
  intervalDays: z.number().int().min(1).max(365),
  nextDue: date,
  status: z.enum(['Scheduled', 'Assigned', 'In progress', 'For review']),
  note: z.string(),
  history: z.array(z.object({ at: date, note: z.string() })).max(200),
});
export const dataSchema = z.object({
  gaps: z.array(gapSchema).max(200),
  orders: z.array(orderSchema).max(200),
  checks: z
    .array(
      z.object({
        id: z.string(),
        outlet,
        product,
        stock: z.number().int().min(0).max(10000),
        price: z.number().min(0).max(1000000),
        display: z.enum(['Meets standard', 'Needs attention']),
        note: text,
        photo,
        createdAt: date,
      }),
    )
    .max(100),
  observations: z
    .array(
      z.object({
        id: z.string(),
        outlet,
        competitor: text,
        category: product,
        price: z.number().positive().max(1000000),
        promotion: text,
        createdAt: date,
      }),
    )
    .max(200),
  assets: z.array(assetSchema).max(100),
  events: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(roles),
        note: z.string(),
        at: date,
      }),
    )
    .max(1000),
  receipts: z
    .record(z.string(), z.string())
    .refine((v) => Object.keys(v).length <= 1000),
});
export type DemoData = z.infer<typeof dataSchema>;
const target = { target: z.string().min(1) };
export const commandSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('gap'), outlet, product, priority, note: text })
    .strict(),
  z
    .object({
      action: z.literal('check'),
      outlet,
      product,
      stock: z.number().int().min(0).max(10000),
      price: z.number().min(0).max(1000000),
      display: z.enum(['Meets standard', 'Needs attention']),
      note: text,
      photo,
    })
    .strict(),
  z.object({ action: z.literal('assign'), ...target, dueAt: date }).strict(),
  z.object({ action: z.literal('resolve'), ...target, note: text }).strict(),
  z
    .object({
      action: z.literal('review'),
      ...target,
      approve: z.boolean(),
      note: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('order'),
      outlet,
      product,
      quantity: z.number().int().min(1).max(10000),
      gapId: z.string().nullable(),
      note: text,
    })
    .strict(),
  z
    .object({ action: z.literal('advanceOrder'), ...target, note: text })
    .strict(),
  z
    .object({
      action: z.literal('competitor'),
      outlet,
      category: product,
      competitor: text,
      price: z.number().positive().max(1000000),
      promotion: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('asset'),
      name: text,
      location: text,
      intervalDays: z.number().int().min(1).max(365),
      nextDue: date,
    })
    .strict(),
  z
    .object({
      action: z.literal('service'),
      ...target,
      step: z.enum(['Assign', 'Start', 'Submit', 'Approve']),
      note: text,
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const envelopeSchema = z
  .object({ id: z.uuid(), role: z.enum(roles), command: commandSchema })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export const sessionSchema = z
  .object({
    version: z.literal(1),
    data: dataSchema,
    queue: z.array(envelopeSchema).max(20),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
/** Illustrative prices only: not retailer observations or a live competitor feed. */
export function competitorSamples(now = Date.now()): DemoData['observations'] {
  const at = new Date(now - 3600000).toISOString();
  return [
    {
      brand: 'Toilex',
      prices: [350, 365, 340],
      promotion:
        'Illustrative 10-roll tissue pack. Sample multi-buy display; not a verified brand offer.',
    },
    {
      brand: 'Celine',
      prices: [330, 345, 325],
      promotion:
        'Illustrative 10-roll tissue pack. Sample shelf-price promotion; not a verified brand offer.',
    },
  ].flatMap(({ brand, prices, promotion }) =>
    outlets.map((outlet, index) => ({
      id: 'sample-competitor-' + brand.toLowerCase() + '-' + index,
      outlet,
      competitor: brand,
      category: products[0],
      price: prices[index]!,
      promotion,
      createdAt: at,
    })),
  );
}
/** Add missing fixtures to an older browser demo without deleting its work or queue. */
export function withCompetitorSamples(
  session: Session,
  now = Date.now(),
): Session {
  const ids = new Set(session.data.observations.map((o) => o.id));
  const missing = competitorSamples(now).filter((o) => !ids.has(o.id));
  if (!missing.length) return session;
  return {
    ...session,
    data: {
      ...session.data,
      observations: [
        ...session.data.observations,
        ...missing.slice(
          0,
          Math.max(0, 200 - session.data.observations.length),
        ),
      ],
    },
  };
}
export function initialSession(now = Date.now()): Session {
  const at = new Date(now - 3600000).toISOString();
  return {
    version: 1,
    queue: [],
    data: {
      gaps: [
        {
          id: 'gap-demo-a',
          outlet: outlets[0],
          product: products[0],
          priority: 'Urgent',
          note: 'Shelf availability requires a replenishment follow-up.',
          status: 'Open',
          assigned: false,
          dueAt: null,
          resolution: '',
          createdAt: at,
        },
        {
          id: 'gap-demo-b',
          outlet: outlets[1],
          product: products[1],
          priority: 'High',
          note: 'The display needs replenishment before the next store visit.',
          status: 'Assigned',
          assigned: true,
          dueAt: new Date(now - 86400000).toISOString(),
          resolution: '',
          createdAt: at,
        },
      ],
      orders: [],
      checks: [],
      observations: competitorSamples(now),
      assets: [
        {
          id: 'asset-demo-a',
          name: 'Packing unit 01',
          location: 'Packing area',
          intervalDays: 30,
          nextDue: new Date(now - 86400000).toISOString(),
          status: 'Scheduled',
          note: '',
          history: [],
        },
      ],
      events: [
        {
          id: 'event-seed',
          role: 'Manager',
          note: 'Workspace opened.',
          at,
        },
      ],
      receipts: {},
    },
  };
}
function requireRole(role: Role, permitted: Role[]) {
  if (!permitted.includes(role))
    throw new Error(
      'Select the workspace role ' +
        permitted.join(' or ') +
        ' for this action.',
    );
}
function get<T extends { id: string }>(rows: T[], id: string): T {
  const row = rows.find((v) => v.id === id);
  if (!row) throw new Error('This record no longer exists.');
  return row;
}
export function applyCommand(
  input: DemoData,
  raw: Envelope,
  now = Date.now(),
): DemoData {
  const env = envelopeSchema.parse(raw);
  const fingerprint = JSON.stringify({ role: env.role, command: env.command });
  if (input.receipts[env.id]) {
    if (input.receipts[env.id] !== fingerprint)
      throw new Error('This request identifier belongs to another submission.');
    return input;
  }
  const data: DemoData = structuredClone(input);
  const c = env.command;
  const at = new Date(now).toISOString();
  let note = '';
  const addGap = (
    o: (typeof outlets)[number],
    p: (typeof products)[number],
    n: string,
    pr: 'Normal' | 'High' | 'Urgent',
  ) => {
    if (
      data.gaps.some(
        (g) => g.outlet === o && g.product === p && g.status !== 'Resolved',
      )
    )
      return;
    data.gaps.unshift({
      id: env.id,
      outlet: o,
      product: p,
      priority: pr,
      note: n,
      status: 'Open',
      assigned: false,
      dueAt: null,
      resolution: '',
      createdAt: at,
    });
  };
  switch (c.action) {
    case 'gap':
      requireRole(env.role, ['Field worker', 'Manager']);
      if (
        data.gaps.some(
          (g) =>
            g.outlet === c.outlet &&
            g.product === c.product &&
            g.status !== 'Resolved',
        )
      )
        throw new Error(
          'An open gap already exists for this outlet and product.',
        );
      addGap(c.outlet, c.product, c.note, c.priority);
      note = 'Stock gap reported: ' + c.outlet + ' · ' + c.product;
      break;
    case 'check':
      requireRole(env.role, ['Field worker', 'Manager']);
      data.checks.unshift({ ...c, id: env.id, createdAt: at });
      if (c.stock === 0)
        addGap(
          c.outlet,
          c.product,
          'Shelf check found no shelf stock. ' + c.note,
          'High',
        );
      note =
        'Shelf check recorded' +
        (c.stock === 0 ? ' · stock gap opened or linked.' : '.');
      break;
    case 'assign': {
      requireRole(env.role, ['Manager']);
      const g = get(data.gaps, c.target);
      if (!['Open', 'Assigned'].includes(g.status))
        throw new Error('Only open gaps can be assigned.');
      if (Date.parse(c.dueAt) <= now)
        throw new Error('Choose a future follow-up deadline.');
      g.status = 'Assigned';
      g.assigned = true;
      g.dueAt = c.dueAt;
      note = 'Follow-up assigned to the field representative.';
      break;
    }
    case 'resolve': {
      requireRole(env.role, ['Field worker']);
      const g = get(data.gaps, c.target);
      if (g.status !== 'Assigned')
        throw new Error('The manager must assign this gap before follow-up.');
      g.status = 'For review';
      g.resolution = c.note;
      note = 'Restocking follow-up submitted for review.';
      break;
    }
    case 'review': {
      requireRole(env.role, ['Manager']);
      const g = get(data.gaps, c.target);
      if (g.status !== 'For review')
        throw new Error('A follow-up must be submitted before review.');
      g.status = c.approve ? 'Resolved' : 'Assigned';
      g.resolution += ' | Manager: ' + c.note;
      note = c.approve
        ? 'Stock gap resolution approved.'
        : 'Stock gap returned for follow-up.';
      break;
    }
    case 'order': {
      requireRole(env.role, ['Field worker', 'Manager']);
      if (c.gapId) {
        const g = get(data.gaps, c.gapId);
        if (
          g.status === 'Resolved' ||
          g.outlet !== c.outlet ||
          g.product !== c.product
        )
          throw new Error('Order must match an unresolved gap.');
        if (
          data.orders.some(
            (o) => o.gapId === c.gapId && o.status !== 'Received',
          )
        )
          throw new Error(
            'A pending replenishment request already exists for this gap.',
          );
      }
      data.orders.unshift({
        ...c,
        id: env.id,
        status: 'Requested',
        createdAt: at,
      });
      note =
        'Internal order request recorded; no supplier or payment contacted.';
      break;
    }
    case 'advanceOrder': {
      const o = get(data.orders, c.target);
      if (o.status === 'Requested') {
        requireRole(env.role, ['Manager']);
        o.status = 'Approved';
      } else if (o.status === 'Approved') {
        requireRole(env.role, ['Manager']);
        o.status = 'Dispatched';
      } else if (o.status === 'Dispatched') {
        requireRole(env.role, ['Field worker']);
        o.status = 'Received';
      } else throw new Error('This order has already been received.');
      o.note = c.note;
      note =
        'Order ' +
        o.status.toLowerCase() +
        '. Receipt does not automatically prove shelf replenishment.';
      break;
    }
    case 'competitor':
      requireRole(env.role, ['Field worker', 'Manager']);
      data.observations.unshift({ ...c, id: env.id, createdAt: at });
      note = 'Dated competitor observation recorded.';
      break;
    case 'asset':
      requireRole(env.role, ['Manager']);
      data.assets.unshift({
        ...c,
        id: env.id,
        status: 'Scheduled',
        note: '',
        history: [],
      });
      note = 'Equipment registered with a recurring service interval.';
      break;
    case 'service': {
      const a = get(data.assets, c.target);
      const expected = {
        Assign: 'Scheduled',
        Start: 'Assigned',
        Submit: 'In progress',
        Approve: 'For review',
      } as const;
      if (a.status !== expected[c.step])
        throw new Error('This service step is out of sequence.');
      requireRole(
        env.role,
        c.step === 'Assign' || c.step === 'Approve'
          ? ['Manager']
          : ['Technician'],
      );
      a.status = (
        {
          Assign: 'Assigned',
          Start: 'In progress',
          Submit: 'For review',
          Approve: 'Scheduled',
        } as const
      )[c.step];
      a.note = c.note;
      a.history.unshift({
        at,
        note: env.role + ': ' + c.step + ' · ' + c.note,
      });
      if (c.step === 'Approve')
        a.nextDue = new Date(now + a.intervalDays * 86400000).toISOString();
      note =
        'Equipment service: ' +
        c.step +
        (c.step === 'Approve'
          ? ' · next service scheduled from approval time.'
          : '.');
      break;
    }
  }
  data.events.unshift({ id: env.id, role: env.role, note, at });
  data.receipts[env.id] = fingerprint;
  return dataSchema.parse(data);
}
