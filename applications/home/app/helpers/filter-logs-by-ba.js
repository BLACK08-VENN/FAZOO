// app/helpers/filter-logs-by-ba.js
import { helper } from '@ember/component/helper';

export default helper(function filterLogsByBa([logs, baId]) {
  if (!logs || !baId) return [];
  return logs.filter((log) => log.modules?.lenovo_ba === baId);
});