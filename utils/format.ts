import numeral from 'numeral'
import {
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
  format,
} from 'date-fns'

/**
 * Formats a given number according to the specified format string.
 *
 * @param number - The number to be formatted.
 * @param formatStr - The format string defining the desired number format.
 *                    Defaults to "0,0" which formats the number with commas as thousand separators.
 * @returns The formatted number as a string.
 */
export const formatNumber = (
  number: number,
  formatStr: string = '0,0'
): string => {
  const result = numeral(number).format(formatStr)
  return result
}

export const formatCustomDate = (dateString: string) => {
  // console.log(dateString)

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
    // console.log('some=>', date)

    return format(date, 'MMMM d, yyyy') // "January 10, 2023"
    // return 'far away'
  }
}

// Usage
// console.log(formatCustomDate('2024-03-05')); // e.g., "3 days ago"
