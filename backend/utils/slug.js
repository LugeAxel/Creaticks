export function generateSlug(text) {
  if (!text) return ''
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .substring(0, 100)
}

export async function generateUniqueSlug(supabaseAdmin, title, excludeId) {
  let slug = generateSlug(title)
  if (!slug) slug = 'event'

  let candidate = slug
  let counter = 1
  while (true) {
    let query = supabaseAdmin.from('events').select('id').eq('slug', candidate).maybeSingle()
    if (excludeId) query = query.neq('id', excludeId)
    const { data: existing } = await query
    if (!existing) break
    candidate = `${slug}-${counter}`
    counter++
  }
  return candidate
}
