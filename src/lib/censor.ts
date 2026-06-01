export function censorName(name: string): string {
  if (!name) return '***'
  if (name.length <= 1) return name + '***'
  const keep = Math.min(4, name.length - 1)
  return name.slice(0, keep) + '***'
}
