export function usefulRoomSubtitle(title: string, subtitle: string): string | null {
  const normalize = (value: string) => value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
  return normalize(title) === normalize(subtitle) ? null : subtitle;
}
