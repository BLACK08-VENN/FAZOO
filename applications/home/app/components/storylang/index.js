import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { TYPE_COLOR } from './arc-diagram';

// Canonical display order for node types
const TYPE_ORDER = [
  'route',
  'service',
  'type',
  'helper',
  'modifier',
  'component',
];

export default class StorylangIndexComponent extends Component {
  @tracked selectedNode = null;
  @tracked model = null;
  @tracked isLoading = true;
  @tracked isEmpty = false;

  @action
  async loadModel() {
    try {
      const response = await fetch('/storylang.json');

      if (!response.ok) {
        this.isEmpty = true;
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        this.isEmpty = true;
        return;
      }

      // Treat missing or fully-empty data as the welcome state
      const hasContent =
        data &&
        [
          'routes',
          'services',
          'types',
          'helpers',
          'modifiers',
          'components',
        ].some((key) => Array.isArray(data[key]) && data[key].length > 0);

      if (hasContent) {
        this.model = data;
      } else {
        this.isEmpty = true;
      }
    } catch {
      this.isEmpty = true;
    } finally {
      this.isLoading = false;
    }
  }

  // ── Legend ────────────────────────────────────────────────────────────────

  get legendItems() {
    return TYPE_ORDER.map((t) => ({
      type: t,
      label: t + 's',
      color: TYPE_COLOR[t] ?? '#8895a7',
    }));
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  get allNodes() {
    const model = this.model;
    if (!model) return [];

    const nodes = [];

    const addNodes = (items, type) => {
      if (!items) return;
      items.forEach((item) => {
        nodes.push({
          id: `${type}:${item.slug}`,
          slug: item.slug,
          type,
          data: item,
        });
      });
    };

    addNodes(model.routes, 'route');
    addNodes(model.services, 'service');
    addNodes(model.types, 'type');
    addNodes(model.helpers, 'helper');
    addNodes(model.modifiers, 'modifier');
    addNodes(model.components, 'component');

    return nodes;
  }

  get filteredNodes() {
    return this.allNodes;
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  get allEdges() {
    const nodes = this.allNodes;
    const nodeIndex = {};
    nodes.forEach((n, i) => {
      nodeIndex[n.slug] = i;
    });

    const edges = [];
    const model = this.model;

    const addEdges = (item, itemType) => {
      const sourceSlug = item.slug;

      if (item.services) {
        item.services.forEach((svc) => {
          edges.push({
            source: sourceSlug,
            target: svc,
            kind: 'service',
            sourceType: itemType,
          });
        });
      }

      if (item.components) {
        item.components.forEach((comp) => {
          edges.push({
            source: sourceSlug,
            target: comp,
            kind: 'component',
            sourceType: itemType,
          });
        });
      }
    };

    (model?.components || []).forEach((c) => addEdges(c, 'component'));
    (model?.routes || []).forEach((r) => addEdges(r, 'route'));
    (model?.services || []).forEach((s) => addEdges(s, 'service'));

    return edges;
  }

  get selectedNodeEdges() {
    if (!this.selectedNode) return [];
    return this.allEdges.filter(
      (e) =>
        e.source === this.selectedNode.slug ||
        e.target === this.selectedNode.slug,
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  @action
  selectNode(node) {
    if (this.selectedNode?.id === node.id) {
      this.selectedNode = null;
    } else {
      this.selectedNode = node;
    }
  }

  @action
  clearSelection() {
    this.selectedNode = null;
  }
}
