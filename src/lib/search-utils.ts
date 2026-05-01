export const SEARCH_MIN_QUERY_LENGTH = 2
export const SEARCH_GROUP_LIMIT = 5
const SEARCH_SNIPPET_LIMIT = 120

export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function splitSearchTerms(value: string): string[] {
  const normalized = normalizeSearchQuery(value)
  return normalized ? normalized.split(' ') : []
}

export function buildSearchSnippet(text: string | null | undefined, query: string): string | null {
  if (!text) return null

  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return null

  const normalizedText = compact.toLowerCase()
  const normalizedQuery = normalizeSearchQuery(query)
  const matchIndex = normalizedQuery ? normalizedText.indexOf(normalizedQuery) : -1

  if (matchIndex < 0) {
    return compact.length <= SEARCH_SNIPPET_LIMIT
      ? compact
      : compact.slice(0, SEARCH_SNIPPET_LIMIT - 1).trimEnd() + '…'
  }

  const start = Math.max(0, matchIndex - 36)
  const end = Math.min(compact.length, matchIndex + normalizedQuery.length + 48)
  const slice = compact.slice(start, end).trim()
  const prefix = start > 0 ? '…' : ''
  const suffix = end < compact.length ? '…' : ''
  const snippet = prefix + slice + suffix

  return snippet.length <= SEARCH_SNIPPET_LIMIT
    ? snippet
    : snippet.slice(0, SEARCH_SNIPPET_LIMIT - 1).trimEnd() + '…'
}
