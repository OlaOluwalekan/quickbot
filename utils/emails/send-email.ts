"use server";

import nodemailer, { Transporter } from "nodemailer";

const sendMail = async (email: string, subject: string, message: string) => {
  try {
    const transporter: Transporter = nodemailer.createTransport({
      service: "gmail",
      secure: true,
      auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const emailOptions = {
      from: process.env.EMAIL_ADDRESS,
      to: email,
      subject: subject,
      html: message,
    };

    const info = await transporter.sendMail(emailOptions);
    console.log("MAIL SENT: " + info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

export default sendMail;
