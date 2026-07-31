import { helper } from '@ember/component/helper';

export default helper(function formatDate([isoString]) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
});
