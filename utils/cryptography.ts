import CryptoJS from "crypto-js";

/**
 * Encrypts a given string using AES encryption.
 *
 * @param data - The string data to be encrypted.
 * @returns The encrypted string.
 */
export const encryptToken = (data: string): string => {
  const encryption = CryptoJS.AES.encrypt(
    data,
    process.env.NEXT_PUBLIC_ENC_SECRET as string
  ).toString();

  return encryption;
};

/**
 * Decrypts a given encrypted token using AES decryption.
 *
 * @param token - The encrypted token string to be decrypted.
 * @returns The decrypted string.
 */
export const decryptToken = (token: string): string => {
  const decryptedBytes = CryptoJS.AES.decrypt(
    token,
    process.env.NEXT_PUBLIC_ENC_SECRET as string
  );
  const decryptedData = decryptedBytes.toString(CryptoJS.enc.Utf8);

  return decryptedData;
};
