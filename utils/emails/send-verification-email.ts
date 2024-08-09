"use server";

import sendMail from "./send-email";

export const sendVerificationEmail = (email: string, token: string) => {
  sendMail(
    email,
    "Verify Your Email",
    `
    <p>Click the link below to verify your email</p>
    <a href="${process.env.DOMAIN}/auth/verify/verification?token=${token}" style="padding: 5px 15px; background: blue; color: white">Verify</a>
    `
  );
};
