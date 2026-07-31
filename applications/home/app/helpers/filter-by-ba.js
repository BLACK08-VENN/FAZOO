import { helper } from '@ember/component/helper';

export default helper(function filterByBa([sessions, baId]) {
  if (!sessions || !baId) return [];
  return sessions.filter((s) => s.modules?.ba === baId);
});
