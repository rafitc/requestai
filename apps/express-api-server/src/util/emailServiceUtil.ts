import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import config from "@config";

import type {NullableString} from "@customTypes/commonTypes";

const transactionEmailTransporter = nodemailer.createTransport({
	host: config.emailService.transactionalEmail.smtpHost,
	port: config.emailService.transactionalEmail.smtpPort,
	secure: config.emailService.transactionalEmail.smtpSecure,
	auth: {
		user: config.emailService.transactionalEmail.smtpUsername,
		pass: config.emailService.transactionalEmail.smtpPassword,
	},
});

const marketingEmailTransporter = nodemailer.createTransport({
	host: config.emailService.marketingEmail.smtpHost,
	port: config.emailService.marketingEmail.smtpPort,
	secure: config.emailService.marketingEmail.smtpSecure,
	auth: {
		user: config.emailService.marketingEmail.smtpUsername,
		pass: config.emailService.marketingEmail.smtpPassword,
	},
});

/**
 * Builds the mail options object.
 *
 * When `EMAIL_DEV_REDIRECT_TO` is set (dev-only knob exposed via
 * `config.emailService.devRedirectTo`), every outbound message is rerouted
 * to that single inbox regardless of the real recipient. The original
 * recipient is preserved in the subject so you can still tell whose OTP
 * landed in your inbox while clicking through the signup flow with throwaway
 * test emails.
 */
function buildMailOptions(
	from: string,
	to: string,
	cc: NullableString,
	bcc: NullableString,
	subject: string,
	textBody: NullableString,
	htmlBody: NullableString
): nodemailer.SendMailOptions {
	const redirectTo = config.emailService.devRedirectTo;
	const effectiveTo = redirectTo || to;
	const effectiveSubject = redirectTo ? `[for ${to}] ${subject}` : subject;
	const effectiveCc = redirectTo ? "" : cc || "";
	const effectiveBcc = redirectTo ? "" : bcc || "";

	const mailOptions: nodemailer.SendMailOptions = {
		from,
		to: effectiveTo,
		cc: effectiveCc,
		bcc: effectiveBcc,
		subject: effectiveSubject,
		text: textBody || "",
		html: htmlBody || "",
	};

	return mailOptions;
}

/**
 * Sends text type body email via transactional email service.
 */
async function sendTransactionTextEmail(
	from: string,
	to: string,
	cc: NullableString,
	bcc: NullableString,
	subject: string,
	textBody: string
): Promise<SMTPTransport.SentMessageInfo> {
	const mailOptions = buildMailOptions(
		from,
		to,
		cc,
		bcc,
		subject,
		textBody,
		null
	);

	const response = await transactionEmailTransporter.sendMail(mailOptions);

	return response;
}

/**
 * Sends text type body email via marketing email service.
 */
async function sendMarketingTextEmail(
	from: string,
	to: string,
	cc: NullableString,
	bcc: NullableString,
	subject: string,
	textBody: string
): Promise<SMTPTransport.SentMessageInfo> {
	const mailOptions = buildMailOptions(
		from,
		to,
		cc,
		bcc,
		subject,
		textBody,
		null
	);

	const response = await marketingEmailTransporter.sendMail(mailOptions);

	return response;
}

/**
 * Sends HTML type body email via transactional email service.
 */
async function sendTransactionHtmlEmail(
	from: string,
	to: string,
	cc: NullableString,
	bcc: NullableString,
	subject: string,
	textBody: string,
	htmlBody: string
): Promise<SMTPTransport.SentMessageInfo> {
	const mailOptions = buildMailOptions(
		from,
		to,
		cc,
		bcc,
		subject,
		textBody,
		htmlBody
	);

	const response = await transactionEmailTransporter.sendMail(mailOptions);

	return response;
}

/**
 * Parses the message ID by removing < and > symbols from the original value.
 */
function parseMessageId(messageIdWithSymbols: string): string {
	let parsedMessageId: string = messageIdWithSymbols;

	parsedMessageId = parsedMessageId.replace("<", "");
	parsedMessageId = parsedMessageId.replace(">", "");

	return parsedMessageId;
}

export default {
	sendTransactionTextEmail,
	sendTransactionHtmlEmail,
	sendMarketingTextEmail,
	parseMessageId,
};
