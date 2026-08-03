// Nodemailer Email Service Configuration

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

// SMTP Configuration interface
interface SMTPConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
}

// Email options interface
export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

// Singleton transporter instance
let transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

/**
 * Get SMTP configuration from environment variables
 */
function getSMTPConfig(): SMTPConfig | null {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || `Voltway Procurement <${user}>`;

    if (!host || !user || !pass) {
        return null;
    }

    return {
        host,
        port,
        secure: port === 465,
        user,
        pass,
        from,
    };
}

/**
 * Get or create Nodemailer transporter (singleton pattern)
 */
export function getTransporter(): Transporter<SMTPTransport.SentMessageInfo> | null {
    if (transporter) {
        return transporter;
    }

    const config = getSMTPConfig();
    if (!config) {
        return null;
    }

    transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.pass,
        },
    });

    return transporter;
}

/**
 * Send email using Nodemailer
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const { assertEmailAllowed } = await import('@/lib/emailAllowlist');
        assertEmailAllowed(options.to);
    } catch (e) {
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Email blocked by staging allowlist',
        };
    }

    const config = getSMTPConfig();
    if (!config) {
        return {
            success: false,
            error: 'SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env.local',
        };
    }

    const transport = getTransporter();
    if (!transport) {
        return {
            success: false,
            error: 'Failed to create email transporter',
        };
    }

    try {
        const info = await transport.sendMail({
            from: config.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
        });

        return {
            success: true,
            messageId: info.messageId,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Verify SMTP connection
 */
export async function verifyConnection(): Promise<boolean> {
    const transport = getTransporter();
    if (!transport) {
        return false;
    }

    try {
        await transport.verify();
        return true;
    } catch {
        return false;
    }
}
