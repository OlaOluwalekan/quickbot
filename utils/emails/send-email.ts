"use server";

// import nodemailer, { Transporter } from "nodemailer";

/**
 * Sends an email using the specified email address, subject, and message.
 * (Nodemailer commented out pending migration to Resend / Brevo)
 *
 * @param {string} email - The recipient's email address.
 * @param {string} subject - The subject line of the email.
 * @param {string} message - The HTML content of the email.
 * @returns {Promise<void>} - A promise that resolves when the email is sent successfully.
 */
const sendMail = async (
  email: string,
  subject: string,
  message: string
): Promise<void> => {
  try {
    /*
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
    */
    console.log(`[Email placeholder] Sending email to: ${email} | Subject: ${subject}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

export default sendMail;

