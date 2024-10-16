import { db } from "../db";
import { v4 as uuidV4 } from "uuid";

/**
 * Retrieves the verification token associated with a given email address.
 *
 * @param email - The email address for which to find the verification token.
 * @returns A promise that resolves to the verification token object if found, or null if not found or an error occurs.
 */
export const getVerificationTokenByEmail = async (email: string) => {
  try {
    return await db.verificationToken.findFirst({
      where: {
        email,
      },
    });
  } catch (error) {
    return null;
  }
};

/**
 * Retrieves the verification token associated with a given token.
 *
 * @param token - The token for which to find the verification token.
 * @returns A promise that resolves to the verification token object if found, or null if not found or an error occurs.
 */
export const getVerificationTokenByToken = async (token: string) => {
  try {
    return await db.verificationToken.findUnique({
      where: {
        token,
      },
    });
  } catch (error) {
    return null;
  }
};

/**
 * Generates a new verification token for the given email address.
 * If a token already exists for the email, it deletes the existing token
 * and creates a new one with a 1-hour expiration time.
 *
 * @param email - The email address for which to generate the verification token.
 * @returns The newly created verification token object or null if an error occurs.
 */
export const generateVerificationToken = async (email: string) => {
  const token = uuidV4();
  const expires = new Date(new Date().getTime() + 3600 * 1000);

  try {
    const existingToken = await getVerificationTokenByEmail(email);
    if (existingToken) {
      await db.verificationToken.delete({
        where: {
          id: existingToken.id,
        },
      });
    }

    const verificationToken = await db.verificationToken.create({
      data: {
        email,
        token,
        expires,
      },
    });
    return verificationToken;
  } catch (error) {
    return null;
  }
};
