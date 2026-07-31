import Component from '@glimmer/component';
import { action } from '@ember/object';
import { TYPE_COLOR, EDGE_COLOR } from './arc-diagram';

// ─── Component ──────────────────────────────────────────────────────────────
//
// Args:
//   @node       – { id, slug, type, data }
//   @edges      – edges already filtered to only those touching @node
//                 [{ source, target, kind }]
//   @allNodes   – full node list (used for navigate-on-click)
//   @onNavigate – (node) => void   navigate to a connected node
//   @onClose    – () => void       deselect / clear
//
export default class StorylangNodeDetailComponent extends Component {

  // ── Colour for the current node's type ───────────────────────────────────

  get typeColor() {
    return TYPE_COLOR[this.args.node?.type] ?? '#8895a7';
  }

  // ── Outgoing / incoming edge rows ─────────────────────────────────────────

  get outgoingEdges() {
    const slug = this.args.node?.slug;
    return (this.args.edges ?? [])
      .filter(e => e.source === slug)
      .map(e => ({
        slug:       e.target,
        kind:       e.kind,
        arrowColor: EDGE_COLOR[e.kind] ?? '#8895a7',
        direction:  'out',
      }));
  }

  get incomingEdges() {
    const slug = this.args.node?.slug;
    return (this.args.edges ?? [])
      .filter(e => e.target === slug)
      .map(e => ({
        slug:       e.source,
        kind:       e.kind,
        arrowColor: EDGE_COLOR[e.kind] ?? '#8895a7',
        direction:  'in',
      }));
  }

  get hasConnections() {
    return this.outgoingEdges.length > 0 || this.incomingEdges.length > 0;
  }

  // ── Data sections for the properties list ────────────────────────────────
  //
  // Each section: { title, items: [{ label, linked }] }

  get sections() {
    const d = this.args.node?.data;
    if (!d) return [];

    const toItems = (arr, linked = false) =>
      (arr ?? []).map(a => ({
        label:  typeof a === 'string' ? a : Object.keys(a)[0],
        linked,
      }));

    return [
      { title: 'Tracked Vars',   items: toItems(d.tracked_vars)         },
      { title: 'Inherited Args', items: toItems(d.inherited_args)        },
      { title: 'Getters',        items: toItems(d.getters)               },
      { title: 'Actions',        items: toItems(d.actions)               },
      { title: 'Functions',      items: toItems(d.functions)             },
      { title: 'Services',       items: toItems(d.services,   true)      },
      { title: 'Components',     items: toItems(d.components, true)      },
      { title: 'Modifiers',      items: toItems(d.modifiers)             },
    ].filter(s => s.items.length > 0);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  @action
  navigateTo(slug) {
    const target = (this.args.allNodes ?? []).find(n => n.slug === slug);
    if (target) this.args.onNavigate?.(target);
  }

  @action
  close() {
    this.args.onClose?.();
  }
}
