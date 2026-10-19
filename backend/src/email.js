import nodemailer from "nodemailer";

function verificationUrl(token, env) {
  const baseUrl = env.APP_BASE_URL;

  if (!baseUrl) {
    throw new Error("APP_BASE_URL is not configured");
  }

  const url = new URL("/verify-email", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function createTransport(env) {
  const host = env.BREVO_SMTP_HOST;
  const port = Number(env.BREVO_SMTP_PORT);
  const user = env.BREVO_SMTP_USER;
  const pass = env.BREVO_SMTP_KEY;

  if (!host || !Number.isInteger(port) || !user || !pass) {
    throw new Error(
      "Brevo SMTP settings are incomplete; check BREVO_SMTP_HOST, BREVO_SMTP_PORT, BREVO_SMTP_USER and BREVO_SMTP_KEY."
    );
  }

  if (!env.BREVO_FROM_EMAIL || !env.BREVO_FROM_NAME) {
    throw new Error(
      "Brevo sender settings are incomplete; check BREVO_FROM_EMAIL and BREVO_FROM_NAME."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function createVerificationEmailSender({
  env = process.env,
  transport,
} = {}) {
  return async function sendVerificationEmail({
    email,
    name,
    token,
  }) {
    const url = verificationUrl(token, env);

    if (env.EMAIL_DELIVERY_MODE === "mock") {
      const hostname = new URL(url).hostname;
      const isLocalhost = [
        "localhost",
        "127.0.0.1",
        "[::1]",
      ].includes(hostname);

      if (
        env.NODE_ENV === "production" ||
        !isLocalhost
      ) {
        throw new Error(
          "Mock email delivery is restricted to localhost outside production."
        );
      }

      return {
        delivered: false,
        previewUrl: url,
      };
    }

    const mailTransport = transport || createTransport(env);
    const safeName = escapeHtml(name || "there");

    await mailTransport.sendMail({
      from: {
        name: env.BREVO_FROM_NAME,
        address: env.BREVO_FROM_EMAIL,
      },
      to: email,
      subject: "Verify your Selbuy email",
      text: [
        `Hello ${name || "there"},`,
        "",
        "Verify your email address to activate your Selbuy account:",
        url,
        "",
        "This link expires in 24 hours. If you did not create a Selbuy account, you can ignore this email.",
      ].join("\n"),
      html: `
        <p>Hello ${safeName},</p>
        <p>Verify your email address to activate your Selbuy account.</p>
        <p><a href="${url}">Verify my email</a></p>
        <p>This link expires in 24 hours. If you did not create a Selbuy account, you can ignore this email.</p>
      `,
    });

    return { delivered: true };
  };
}

export const sendVerificationEmail =
  createVerificationEmailSender();
