import numeral from "numeral";

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
  formatStr: string = "0,0"
): string => {
  const result = numeral(number).format(formatStr);
  return result;
};
