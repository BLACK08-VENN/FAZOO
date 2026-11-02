'use client';

import { useState } from 'react';
import { ArrowUpRight, BarChart3, Check, MapPin, Users } from 'lucide-react';
import styles from './sign-in.module.css';

const workflows = [
  {
    name: 'Visits',
    icon: MapPin,
    eyebrow: 'From arrival to checkout',
    title: 'Know what happened in store.',
    description: 'A clear record of each visit, with location checks and photos to support it.',
    steps: [
      ['Check in', 'Verify arrival at the assigned store.'],
      ['Capture the details', 'Record stock, photos and sales.'],
      ['Review the visit', 'Keep field activity in one place.'],
    ],
    outcome: 'Visibility beyond the check-in.',
  },
  {
    name: 'Sales',
    icon: BarChart3,
    eyebrow: 'From store activity to insight',
    title: 'Turn sales records into clarity.',
    description: 'Bring sales entries together so your team can review performance with context.',
    steps: [
      ['Record sales', 'Capture products and quantities sold.'],
      ['See performance', 'Review sales across stores and campaigns.'],
      ['Share the picture', 'Use reports to guide the next conversation.'],
    ],
    outcome: 'Better context for your next decision.',
  },
  {
    name: 'Teams',
    icon: Users,
    eyebrow: 'From assignments to oversight',
    title: 'Keep everyone moving together.',
    description: 'Connect field teams and managers around the same stores, campaigns and activity.',
    steps: [
      ['Organize the work', 'Manage people, stores and campaigns.'],
      ['Follow activity', 'Review visits and daily field records.'],
      ['Stay aligned', 'Give each role its own workspace.'],
    ],
    outcome: 'A shared view of the work.',
  },
] as const;

export function WorkspaceShowcase() {
  const [selected, setSelected] = useState(0);
  const workflow = workflows[selected] ?? workflows[0];
  const Icon = workflow.icon;

  return (
    <div className={styles.showcase}>
      <div className={styles.showcaseChoices} role="group" aria-label="Explore FAZOO workflows">
        {workflows.map((item, index) => {
          const ChoiceIcon = item.icon;
          return (
            <button
              key={item.name}
              type="button"
              aria-pressed={selected === index}
              aria-controls="workspace-workflow"
              onClick={() => setSelected(index)}
              className={styles.showcaseChoice}
            >
              <ChoiceIcon size={16} aria-hidden="true" />
              {item.name}
            </button>
          );
        })}
      </div>
      <div id="workspace-workflow" aria-live="polite" aria-atomic="true" className={styles.showcaseContent}>
        <div className={styles.showcaseHeading}>
          <span className={styles.showcaseIcon}><Icon size={21} aria-hidden="true" /></span>
          <p className={styles.showcaseEyebrow}>{workflow.eyebrow}</p>
          <span className={styles.showcaseIndex} aria-hidden="true">0{selected + 1} / 03</span>
        </div>
        <h2 className={styles.showcaseTitle}>{workflow.title}</h2>
        <p className={styles.showcaseDescription}>{workflow.description}</p>
        <ol className={styles.workflowSteps}>
          {workflow.steps.map(([title, detail]) => (
            <li key={title}>
              <span className={styles.workflowCheck}><Check size={13} aria-hidden="true" /></span>
              <div><p>{title}</p><span>{detail}</span></div>
            </li>
          ))}
        </ol>
        <p className={styles.showcaseOutcome}>
          {workflow.outcome}<ArrowUpRight size={17} aria-hidden="true" />
        </p>
      </div>
    </div>
  );
}
