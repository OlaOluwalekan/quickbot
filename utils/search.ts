export /**
 * Returns a snippet of the given text (of length snippetLength) that includes the first occurrence
 * of searchTerm. In the snippet, the first occurrence is wrapped in a <span>.
 *
 * @param {string} text - The full text to search in.
 * @param {string} searchTerm - The text to find and highlight.
 * @param {number} snippetLength - The desired snippet length (default 200).
 * @returns {string} The snippet with searchTerm wrapped in a <span>.
 */
function getSnippetWithHighlight(
  text: string,
  searchTerm: string,
  snippetLength = 200
) {
  // Create a regular expression for the search term (case-insensitive).
  const searchRegex = new RegExp(searchTerm, 'i')
  const match = text.match(searchRegex)
  if (!match) return '' // If not found, return an empty string.

  const termIndex = match.index

  // Find the start of the sentence by looking backward for punctuation (. ? or !)
  // We'll consider the character right after the last punctuation before the match as the sentence start.
  const punctuationRegex = /[.?!]/g
  let sentenceStart = 0
  let lastPunctuationIndex = -1

  // Loop through punctuation matches
  let pMatch
  while ((pMatch = punctuationRegex.exec(text)) !== null) {
    if (pMatch.index < (termIndex as number)) {
      lastPunctuationIndex = pMatch.index
    } else {
      break
    }
  }
  if (lastPunctuationIndex !== -1) {
    sentenceStart = lastPunctuationIndex + 1 // start right after punctuation
  }

  // Trim leading whitespace at the sentence start.
  while (text[sentenceStart] === ' ' || text[sentenceStart] === '\n') {
    sentenceStart++
  }

  // Determine where to start the snippet.
  // Default: start from the sentence start.
  let snippetStart = sentenceStart

  // If the search term is too far from the sentence start such that a snippet
  // starting at sentenceStart would not include it, adjust snippetStart so the term is inside.
  if (
    (termIndex as number) - sentenceStart >
    snippetLength - searchTerm.length
  ) {
    snippetStart = (termIndex as number) - Math.floor(snippetLength / 2)
    // But do not go before the sentence start.
    if (snippetStart < sentenceStart) snippetStart = sentenceStart
  }

  let snippetEnd = snippetStart + snippetLength

  // Ensure the snippet includes the entire search term.
  if (snippetEnd < (termIndex as number) + searchTerm.length) {
    snippetEnd = (termIndex as number) + searchTerm.length
    snippetStart = snippetEnd - snippetLength
    if (snippetStart < sentenceStart) snippetStart = sentenceStart
  }

  // Extract the snippet.
  let snippet = text.substring(snippetStart, snippetEnd)

  // Replace the first occurrence of the search term with a wrapped version.
  // (Using the same regex we defined.)
  snippet = snippet.replace(
    searchRegex,
    (found: string) => `<span class="bg-yellow">${found}</span>`
  )

  return snippet
}
