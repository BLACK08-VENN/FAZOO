const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_PREPARED_DOCUMENT_BYTES = 4 * 1024 * 1024;
export function inspectPreparedDocument(
  name: string,
  reportedType: string,
  bytes: Uint8Array,
): { extension: 'pdf' | 'doc' | 'docx'; mimeType: string } {
  if (!bytes.length || bytes.length > MAX_PREPARED_DOCUMENT_BYTES)
    throw new Error('Choose a Word or PDF document up to 4 MB.');
  const extension = /\.(pdf|docx?)$/i.exec(name.trim())?.[1]?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'doc' && extension !== 'docx')
    throw new Error('Choose a Word or PDF document.');
  const mimeType =
    extension === 'pdf' ? 'application/pdf' : extension === 'doc' ? 'application/msword' : DOCX;
  const type = reportedType.trim().toLowerCase();
  if (type && type !== 'application/octet-stream' && type !== mimeType)
    throw new Error('File type does not match its extension.');
  const starts = (signature: number[]) => signature.every((v, i) => bytes[i] === v);
  const valid =
    extension === 'pdf'
      ? starts([0x25, 0x50, 0x44, 0x46, 0x2d])
      : extension === 'doc'
        ? starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        : starts([0x50, 0x4b, 0x03, 0x04]) &&
          Buffer.from(bytes).includes(Buffer.from('[Content_Types].xml')) &&
          Buffer.from(bytes).includes(Buffer.from('word/document.xml')) &&
          !Buffer.from(bytes).includes(Buffer.from('vbaProject.bin'));
  if (!valid) throw new Error('Document contents do not match the selected file type.');
  return { extension, mimeType };
}
export function safeLocalRedirect(value: string): string {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\r\n]/.test(decoded))
      return '/overview';
    const parsed = new URL(value, 'https://fazoo.invalid');
    return parsed.origin === 'https://fazoo.invalid'
      ? parsed.pathname + parsed.search
      : '/overview';
  } catch {
    return '/overview';
  }
}
