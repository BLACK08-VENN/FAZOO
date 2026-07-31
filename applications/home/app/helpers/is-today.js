export default function isToday(dateValue /*, positionalB, named*/) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
