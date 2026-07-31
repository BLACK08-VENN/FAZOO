import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

// ─── Visual constants ────────────────────────────────────────────────────────
const RADIUS = 220;
const CENTER_X = 340;
const CENTER_Y = 340;
const SVG_SIZE = 680;
const DOT_R = 3.5;
const DOT_R_EDGE = 4.5;
const DOT_R_SEL = 5.5;
const LABEL_OFFSET = 18;
const ARC_PULL = 0.45;

// Zoom constants
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.12; // per button press

// Inertia / drag constants
const INERTIA_FRICTION = 0.88;
const INERTIA_MIN_VEL = 0.03;
const VELOCITY_SMOOTH = 0.25;

const TYPE_ORDER = [
  'route',
  'service',
  'type',
  'helper',
  'modifier',
  'component',
];

export const TYPE_COLOR = {
  component: '#4fc3f7',
  route: '#a78bfa',
  service: '#34d399',
  helper: '#fbbf24',
  modifier: '#f87171',
  type: '#fb923c',
};

export const EDGE_COLOR = {
  service: 'rgba(52,211,153,0.7)',
  component: 'rgba(79,195,247,0.6)',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function polarToXY(angleDeg, r, cx = CENTER_X, cy = CENTER_Y) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pointerAngle(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  const scaleX = SVG_SIZE / rect.width;
  const scaleY = SVG_SIZE / rect.height;
  const dx = (clientX - rect.left) * scaleX - CENTER_X;
  const dy = (clientY - rect.top) * scaleY - CENTER_Y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

// ─── Component ───────────────────────────────────────────────────────────────
export default class StorylangArcDiagramComponent extends Component {
  // ── Tracked state ─────────────────────────────────────────────────────────

  @tracked rotationDeg = 0;
  @tracked zoomScale = 1;

  // ── Private drag / inertia state ──────────────────────────────────────────

  _isDragging = false;
  _dragStartAngle = 0;
  _dragStartRot = 0;
  _lastAngle = 0;
  _velocity = 0;
  _dragMoved = false; // true once pointer moves enough to count as a drag
  _rafId = null;
  _svgEl = null;
  _pendingNodeClick = null; // node targeted by the current pointerdown

  // ── Sorted nodes ─────────────────────────────────────────────────────────

  get nodes() {
    return [...(this.args.nodes ?? [])].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      return (
        (ai === -1 ? TYPE_ORDER.length : ai) -
        (bi === -1 ? TYPE_ORDER.length : bi)
      );
    });
  }

  // ── Filtered edges ────────────────────────────────────────────────────────

  get edges() {
    const slugSet = new Set(this.nodes.map((n) => n.slug));
    return (this.args.edges ?? []).filter(
      (e) => slugSet.has(e.source) && slugSet.has(e.target),
    );
  }

  get selectedSlug() {
    return this.args.selectedNode?.slug ?? null;
  }

  // ── SVG viewBox ───────────────────────────────────────────────────────────

  get viewBox() {
    return `0 0 ${SVG_SIZE} ${SVG_SIZE}`;
  }

  // ── Transforms ────────────────────────────────────────────────────────────

  /** Rotation applied to the ring group */
  get ringTransform() {
    return `rotate(${this.rotationDeg}, ${CENTER_X}, ${CENTER_Y})`;
  }

  /** Scale applied to the whole SVG content, centred on the SVG centre */
  get zoomTransform() {
    const s = this.zoomScale;
    // translate so scaling happens around the centre point
    const tx = CENTER_X * (1 - s);
    const ty = CENTER_Y * (1 - s);
    return `translate(${tx}, ${ty}) scale(${s})`;
  }

  // ── Angle per node ────────────────────────────────────────────────────────

  get angleStep() {
    const n = this.nodes.length;
    return n > 0 ? 360 / n : 0;
  }

  get nodeAngles() {
    const map = {};
    this.nodes.forEach((nd, i) => {
      map[nd.slug] = i * this.angleStep;
    });
    return map;
  }

  // ── Type-group arcs ───────────────────────────────────────────────────────

  get typeGroups() {
    const nodes = this.nodes;
    const groups = [];
    let i = 0;
    while (i < nodes.length) {
      const t = nodes[i].type;
      let j = i;
      while (j < nodes.length && nodes[j].type === t) j++;
      groups.push({ type: t, startIdx: i, endIdx: j - 1 });
      i = j;
    }
    return groups;
  }

  get typeGroupArcs() {
    const step = this.angleStep;
    const R = RADIUS + 14;
    const r = RADIUS + 6;

    return this.typeGroups.map((g) => {
      const startAngle = g.startIdx * step - step * 0.45;
      const endAngle = g.endIdx * step + step * 0.45;
      const midAngle = (startAngle + endAngle) / 2;

      const s1 = polarToXY(startAngle, R);
      const s2 = polarToXY(startAngle, r);
      const e1 = polarToXY(endAngle, R);
      const e2 = polarToXY(endAngle, r);

      const largeArc = endAngle - startAngle > 180 ? 1 : 0;

      const path =
        `M ${s2.x} ${s2.y}` +
        ` A ${r} ${r} 0 ${largeArc} 1 ${e2.x} ${e2.y}` +
        ` L ${e1.x} ${e1.y}` +
        ` A ${R} ${R} 0 ${largeArc} 0 ${s1.x} ${s1.y}` +
        ` Z`;

      const lp = polarToXY(midAngle, R + 12);
      const isLeftSide = midAngle % 360 > 180;
      const anchor = isLeftSide ? 'end' : 'start';
      const anchorFinal =
        Math.abs((midAngle % 360) - 180) < 20 ||
        midAngle % 360 < 20 ||
        midAngle % 360 > 340
          ? 'middle'
          : anchor;
      const segLabelRotate = isLeftSide
        ? (midAngle % 360) + 90
        : (midAngle % 360) - 90;

      return {
        type: g.type,
        path,
        color: TYPE_COLOR[g.type] ?? '#8895a7',
        labelX: lp.x,
        labelY: lp.y,
        label: g.type.toUpperCase() + 'S',
        anchor: anchorFinal,
        labelRotate: segLabelRotate,
      };
    });
  }

  // ── Node display list ─────────────────────────────────────────────────────
  //
  // The key fix: label rotation and text-anchor must be derived from the node's
  // *effective screen angle* = (static nodeAngle + current rotationDeg), so that
  // as the ring spins, labels continuously flip to remain readable.

  get nodeDisplayList() {
    const { nodes, edges, selectedSlug, nodeAngles, rotationDeg } = this;

    return nodes.map((nd) => {
      const angle = nodeAngles[nd.slug]; // static angle on the ring
      const pos = polarToXY(angle, RADIUS);
      const labelPos = polarToXY(angle, RADIUS + LABEL_OFFSET);

      const isSelected = nd.slug === selectedSlug;
      const inEdge =
        selectedSlug != null &&
        edges.some(
          (e) =>
            (e.source === selectedSlug && e.target === nd.slug) ||
            (e.target === selectedSlug && e.source === nd.slug),
        );
      const isDimmed = selectedSlug != null && !isSelected && !inEdge;
      const color = TYPE_COLOR[nd.type] ?? '#8895a7';

      // ── Rotation-aware label orientation ────────────────────────────────
      // effectiveAngle is the clock-angle at which the node currently appears
      // on screen (0 = top, increases clockwise).
      const effectiveAngle = (((angle + rotationDeg) % 360) + 360) % 360;
      const isLeftHalf = effectiveAngle > 180;

      // The <text> is placed at labelPos and we rotate it around that point.
      // svgAngle converts our clock-angle to SVG's math-angle convention
      // (SVG rotate: 0=right, clockwise). The static node angle (not the
      // effective one) is used for the rotation axis since labelPos is
      // already inside the rotatable <g>, but we must flip based on the
      // effective (rotated) position.
      const svgAngle = angle - 90;
      const labelRotate = String(isLeftHalf ? svgAngle + 180 : svgAngle);
      const textAnchor = isLeftHalf ? 'end' : 'start';

      return {
        node: nd,
        cx: pos.x,
        cy: pos.y,
        labelX: labelPos.x,
        labelY: labelPos.y,
        labelRotate,
        textAnchor,
        isSelected,
        inEdge,
        isDimmed,
        color,
        dotR: isSelected ? DOT_R_SEL : inEdge ? DOT_R_EDGE : DOT_R,
        dotOpacity: isDimmed ? 0.15 : 1,
        labelFill: isSelected ? '#f0f6fc' : inEdge ? '#c9d1d9' : '#6e7c8a',
        labelWeight: isSelected ? 600 : 400,
        groupClass: `sl-node-group${isSelected ? ' active' : ''}${isDimmed ? ' dimmed' : ''}`,
      };
    });
  }

  // ── Arc display list ──────────────────────────────────────────────────────

  get arcDisplayList() {
    const { edges, nodeAngles, selectedSlug } = this;

    return edges
      .map((e) => {
        const a1 = nodeAngles[e.source];
        const a2 = nodeAngles[e.target];
        if (a1 == null || a2 == null) return null;

        const p1 = polarToXY(a1, RADIUS);
        const p2 = polarToXY(a2, RADIUS);

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const cpx = CENTER_X + (mx - CENTER_X) * (1 - ARC_PULL);
        const cpy = CENTER_Y + (my - CENTER_Y) * (1 - ARC_PULL);

        const path = `M ${p1.x} ${p1.y} Q ${cpx} ${cpy} ${p2.x} ${p2.y}`;

        const isHighlighted =
          selectedSlug != null &&
          (e.source === selectedSlug || e.target === selectedSlug);
        const isDimmed = selectedSlug != null && !isHighlighted;

        return {
          path,
          stroke: EDGE_COLOR[e.kind] ?? 'rgba(200,200,200,0.4)',
          strokeWidth: isHighlighted ? 1.8 : 1,
          arcClass: `sl-arc-path${isDimmed ? ' dimmed' : isHighlighted ? ' highlighted' : ' default'}`,
        };
      })
      .filter(Boolean);
  }

  // ── Centre point ──────────────────────────────────────────────────────────

  get cx() {
    return CENTER_X;
  }
  get cy() {
    return CENTER_Y;
  }

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  _applyZoom(newScale) {
    this.zoomScale = clamp(newScale, ZOOM_MIN, ZOOM_MAX);
  }

  @action
  zoomIn() {
    this._applyZoom(this.zoomScale * (1 + ZOOM_STEP));
  }

  @action
  zoomOut() {
    this._applyZoom(this.zoomScale * (1 - ZOOM_STEP));
  }

  @action
  zoomReset() {
    this.zoomScale = 1;
  }

  // ── Inertia helpers ───────────────────────────────────────────────────────

  _cancelInertia() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _startInertia() {
    this._cancelInertia();
    const tick = () => {
      this._velocity *= INERTIA_FRICTION;
      if (Math.abs(this._velocity) < INERTIA_MIN_VEL) {
        this._velocity = 0;
        this._rafId = null;
        return;
      }
      this.rotationDeg = this.rotationDeg + this._velocity;
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  // ── Pointer events ────────────────────────────────────────────────────────

  @action
  registerSvg(el) {
    this._svgEl = el;
  }

  @action
  handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;

    this._cancelInertia();
    this._isDragging = true;
    this._dragMoved = false;
    this._velocity = 0;
    // Walk up from the event target to see if it's inside a node group.
    // We must record this now because setPointerCapture redirects all
    // subsequent pointer events to the SVG, so the click event on the
    // <g> never fires.
    this._pendingNodeClick =
      event.target?.closest?.('[data-node-slug]')?.dataset?.nodeSlug ?? null;

    const angle = pointerAngle(this._svgEl, event.clientX, event.clientY);
    this._dragStartAngle = angle;
    this._dragStartRot = this.rotationDeg;
    this._lastAngle = angle;

    this._svgEl.setPointerCapture(event.pointerId);
  }

  @action
  handlePointerMove(event) {
    if (!this._isDragging) return;

    const angle = pointerAngle(this._svgEl, event.clientX, event.clientY);

    let delta = angle - this._dragStartAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    this.rotationDeg = this._dragStartRot + delta;

    // Mark as a real drag once angular movement exceeds a small threshold
    if (Math.abs(delta) > 3) this._dragMoved = true;
  }

  @action
  handlePointerUp(event) {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._svgEl.releasePointerCapture(event.pointerId);

    // If the pointer didn't move enough to count as a drag and it started
    // on a node, treat it as a node click.
    if (!this._dragMoved && this._pendingNodeClick) {
      const nd = this.nodes.find((n) => n.slug === this._pendingNodeClick);
      if (nd) this.args.onSelectNode?.(nd);
    }
    this._pendingNodeClick = null;
  }

  // Node clicks are now handled in handlePointerUp via _pendingNodeClick,
  // so this action is no longer needed.
}
