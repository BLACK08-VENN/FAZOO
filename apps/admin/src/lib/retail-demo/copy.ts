/** Presentation aliases keep persisted catalog values and queued request fingerprints intact. */
export function workspaceLabel(value: string): string {
  const aliases: Record<string, string> = {
    'Case-study tissue pack': 'Tissue · 10-roll pack',
    'Case-study wipes pack': 'Wet wipes',
    'Case-study kitchen roll': 'Kitchen roll',
    'Demo outlet A': 'Outlet A',
    'Demo outlet B': 'Outlet B',
    'Demo outlet C': 'Outlet C',
    'Demo field worker': 'Field representative',
    'Demo packing unit': 'Packing unit 01',
    'Fictional service area': 'Packing area',
    'Fictional shelf gap reported during the demo visit.':
      'Shelf availability requires a replenishment follow-up.',
    'Fictional display needs replenishment.':
      'The display needs replenishment before the next store visit.',
    'Fictional case-study workspace initialized.': 'Workspace opened.',
  };
  let result = value;
  for (const [from, to] of Object.entries(aliases))
    result = result.split(from).join(to);
  return result
    .replace(/\b(?:demo|fictional|simulated|case-study)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
