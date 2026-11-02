import {
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
  format,
} from 'date-fns'

/**
 * Formats a given number using Intl.NumberFormat.
 *
 * @param number - The number to be formatted.
 * @param _formatStr - Legacy format string parameter (retained for signature compatibility).
 * @returns The formatted number as a string with thousand separators.
 */
export const formatNumber = (
  number: number,
  _formatStr: string = '0,0'
): string => {
  if (!Number.isFinite(number)) return '0'
  const decimalMatch = _formatStr.match(/\.([0]+)/)
  const fractionDigits = decimalMatch?.[1] ? decimalMatch[1].length : 0
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(number)
}

export const formatCustomDate = (dateString: string) => {
  const date = new Date(dateString)

  if (isToday(date)) {
    return 'Today'
  } else if (isYesterday(date)) {
    return 'Yesterday'
  } else if (isThisWeek(date)) {
    return formatDistanceToNow(date, { addSuffix: true }) // "3 days ago"
  } else if (isThisMonth(date)) {
    return format(date, 'MMMM d') // "March 5"
  } else {
    return format(date, 'MMMM d, yyyy') // "January 10, 2023"
  }
}

export function getSnippetWithHighlight(
  text: string,
  searchTerm: string,
  snippetLength = 200
) {
  const searchRegex = new RegExp(searchTerm, 'i')
  const match = text.match(searchRegex)
  if (!match) return ''

  const termIndex = match.index
  const punctuationRegex = /[.?!]/g
  let sentenceStart = 0
  let lastPunctuationIndex = -1

  let pMatch
  while ((pMatch = punctuationRegex.exec(text)) !== null) {
    if (pMatch.index < (termIndex as number)) {
      lastPunctuationIndex = pMatch.index
    } else {
      break
    }
  }
  if (lastPunctuationIndex !== -1) {
    sentenceStart = lastPunctuationIndex + 1
  }

  while (text[sentenceStart] === ' ' || text[sentenceStart] === '\n') {
    sentenceStart++
  }

  let snippetStart = sentenceStart
  if ((termIndex as number) - sentenceStart > snippetLength - searchTerm.length) {
    snippetStart = (termIndex as number) - Math.floor(snippetLength / 2)
    if (snippetStart < sentenceStart) snippetStart = sentenceStart
  }

  let snippetEnd = snippetStart + snippetLength
  if (snippetEnd < (termIndex as number) + searchTerm.length) {
    snippetEnd = (termIndex as number) + searchTerm.length
    snippetStart = snippetEnd - snippetLength
    if (snippetStart < sentenceStart) snippetStart = sentenceStart
  }

  let snippet = text.substring(snippetStart, snippetEnd)
  snippet = snippet.replace(
    searchRegex,
    (found: string) => `<span class="bg-accent-soft">${found}</span>`
  )

  return snippet
}
