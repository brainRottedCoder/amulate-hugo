// Hugo Email API - Send reorder emails to suppliers via Nodemailer

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import {
  generateReorderEmailHTML,
  generateReorderEmailText,
  generateReorderSubject,
  type ReorderEmailData
} from '@/lib/email-templates';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import { logger } from '@/lib/observability/logger';

export async function POST(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:email',
    rateLimit: true,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    const body = await request.json();

    const { supplierEmail, partId, partName } = body;

    if (!supplierEmail) {
      return NextResponse.json(
        { error: 'Supplier email is required', requestId },
        { status: 400 }
      );
    }

    if (!partId || !partName) {
      return NextResponse.json(
        { error: 'Part ID and Part Name are required', requestId },
        { status: 400 }
      );
    }

    const emailData: ReorderEmailData = {
      supplierName: body.supplierName || 'Valued Supplier',
      partId: body.partId,
      partName: body.partName,
      currentStock: body.currentStock || 0,
      minStock: body.minStock || 50,
      reorderQuantity: body.reorderQuantity || 100,
      notes: body.notes,
    };

    const subject = generateReorderSubject(emailData);
    const html = generateReorderEmailHTML(emailData);
    const text = generateReorderEmailText(emailData);

    logger.info('hugo_email', {
      requestId,
      userId: user.uid,
      partId: emailData.partId,
    });

    const result = await sendEmail({
      to: supplierEmail,
      subject,
      html,
      text,
    });

    if (!result.success) {
      logger.error('hugo_email_failed', { requestId, error: result.error });
      return NextResponse.json(
        { error: result.error, requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Email sent successfully to ${supplierEmail}`,
      messageId: result.messageId,
      requestId,
      timestamp: new Date().toISOString(),
      details: {
        partId: emailData.partId,
        partName: emailData.partName,
        reorderQuantity: emailData.reorderQuantity,
      },
    });
  } catch (error: unknown) {
    logger.error('hugo_email_error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(error, requestId);
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: false,
  });
  if (authResult instanceof NextResponse) return authResult;

  const smtpConfigured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

  return NextResponse.json({
    service: 'Nodemailer Email Service',
    status: smtpConfigured ? 'configured' : 'not_configured',
    smtp: {
      host: process.env.SMTP_HOST ? '✓ Set' : '✗ Missing',
      port: process.env.SMTP_PORT || '587 (default)',
      user: process.env.SMTP_USER ? '✓ Set' : '✗ Missing',
      pass: process.env.SMTP_PASS ? '✓ Set' : '✗ Missing',
      from: process.env.SMTP_FROM || '(will use SMTP_USER)',
    },
  });
}
