import sgMail from "@sendgrid/mail";

export type SendMailArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string; // opcional: sobrescrever default
  replyTo?: string;
  categories?: string[]; // útil pra filtros no SendGrid
  customArgs?: Record<string, string>; // rastreio interno
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function hasSendgridConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.MAIL_FROM);
}

/**
 * Envia email via SendGrid Web API.
 * - Em dev, se não houver SENDGRID_API_KEY/MAIL_FROM, faz fallback e loga no console.
 * - Em produção, recomendo manter SENDGRID_API_KEY/MAIL_FROM sempre definidos.
 */
export async function sendMail(args: SendMailArgs): Promise<void> {
  const env = process.env.NODE_ENV || "development";

  if (!hasSendgridConfigured()) {
    // fallback: não quebra dev/staging
    console.warn("⚠️ SendGrid não configurado (SENDGRID_API_KEY/MAIL_FROM ausentes). Email em modo fallback.");
    console.log("[mail:fallback] to:", args.to);
    console.log("[mail:fallback] subject:", args.subject);
    if (args.text) console.log("[mail:fallback] text:", args.text);
    if (args.html) console.log("[mail:fallback] html:", args.html);
    return;
  }

  const apiKey = requiredEnv("SENDGRID_API_KEY");
  const defaultFrom = requiredEnv("MAIL_FROM");

  sgMail.setApiKey(apiKey);

  // SendGrid exige pelo menos text ou html
  const html = args.html ?? undefined;
  const text:any = args.text ?? (html ? stripHtmlToText(html) : undefined);

  if (!html && !text) {
    throw new Error("sendMail requires at least one of: html, text");
  }

  try {
    await sgMail.send({
      to: args.to,
      from: args.from ?? defaultFrom,
      subject: args.subject,
      text,
      html,
      replyTo: args.replyTo,
      categories: args.categories,
      customArgs: args.customArgs,
    });
  } catch (err: any) {
    // Log detalhado e útil
    const statusCode = err?.code ?? err?.response?.statusCode;
    const body = err?.response?.body;
    console.error("❌ SendGrid sendMail failed", {
      env,
      statusCode,
      message: err?.message,
      body,
    });

    console.error("❌ SendGrid error body:", JSON.stringify(err?.response?.body, null, 2));

    // Re-throw para o controller decidir (mas lembre: password-reset normalmente engole erro de propósito)
    throw err;
  }
}

/**
 * Opcional: verificação "leve" no boot (não existe um verify real na Web API),
 * mas você pode validar se envs existem e logar.
 */
export function verifyMailConfig(): void {
  if (hasSendgridConfigured()) {
    console.log("✅ SendGrid mail config OK (SENDGRID_API_KEY + MAIL_FROM presentes).");
  } else {
    console.warn("⚠️ SendGrid mail config missing. (SENDGRID_API_KEY/MAIL_FROM)");
  }
}

/**
 * Conversão simples HTML -> texto (bem básica) para garantir text/plain.
 * Se preferir algo mais completo, dá pra trocar por uma lib, mas isso aqui já ajuda.
 */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
