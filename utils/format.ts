import numeral from "numeral";

export const formatNumber = (
  number: number,
  formatStr: string = "0,0"
): string => {
  const result = numeral(number).format(formatStr);
  return result;
};
