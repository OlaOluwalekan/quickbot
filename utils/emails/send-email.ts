"use server";

import nodemailer, { Transporter } from "nodemailer";

const sendMail = (email: string, subject: string, message: string) => {
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

  transporter.sendMail(emailOptions, (err, info) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Email sent");
    }
  });
};

export default sendMail;
