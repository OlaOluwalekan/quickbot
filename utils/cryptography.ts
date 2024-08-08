import CryptoJS from "crypto-js";

export const encryptToken = (data: string): string => {
  const encryption = CryptoJS.AES.encrypt(
    data,
    process.env.NEXT_PUBLIC_ENC_SECRET as string
  ).toString();

  return encryption;
};

export const decryptToken = (token: string): string => {
  const decryptedBytes = CryptoJS.AES.decrypt(
    token,
    process.env.NEXT_PUBLIC_ENC_SECRET as string
  );
  const decryptedData = decryptedBytes.toString(CryptoJS.enc.Utf8);

  return decryptedData;
};
