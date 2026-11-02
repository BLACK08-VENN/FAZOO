import Link from 'next/link';
import { ArrowUpRight, Plus, Wrench } from 'lucide-react';
import type { DashboardSummary } from '@/lib/maintenance/summary';
import styles from './dashboard-card.module.css';

export function MaintenanceDashboardCard({
  summary,
  onOpen,
  onNew,
}: {
  summary: DashboardSummary;
  onOpen?: () => void;
  onNew?: () => void;
}) {
  return (
    <section className={styles.card} aria-label={summary.title}>
      <div className={styles.heading}>
        <div className={styles.title}>
          <span className={styles.icon}>
            <Wrench size={22} aria-hidden="true" />
          </span>
          <div>
            <p>SERVICE DESK</p>
            <h2>{summary.title}</h2>
          </div>
        </div>
        <span className={styles.badge}>Maintenance</span>
      </div>
      <p className={styles.description}>{summary.description}</p>
      <dl className={styles.stats}>
        {summary.stats.map((stat) => (
          <div key={stat.label} data-attention={Boolean(stat.attention && stat.value > 0)}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.actions}>
        {onOpen ? (
          <button type="button" onClick={onOpen}>
            Open service desk <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <Link href="/service-desk">
            Open service desk <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
        {onNew ? (
          <button type="button" onClick={onNew}>
            <Plus size={15} aria-hidden="true" />
            Report an issue
          </button>
        ) : (
          <Link href="/service-desk?new=1">
            <Plus size={15} aria-hidden="true" />
            Report an issue
          </Link>
        )}
      </div>
      <p className={styles.scope}>{summary.scope}</p>
    </section>
  );
}
