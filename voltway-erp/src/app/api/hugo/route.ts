// Hugo AI API Route - LangChain with Fireworks (MiniMax M3)

import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import {
  createFireworksChatModel,
  getFireworksProviderMeta,
} from '@/lib/hugo/providers/fireworks';
import { flags } from '@/lib/config';
import { getEffectiveFlags } from '@/lib/config/runtimeFlags';
import { logger } from '@/lib/observability/logger';
import { runHugoOrchestrator } from '@/lib/hugo/orchestrator';
import { PROMPT_VERSION } from '@/lib/hugo/prompts';

const HUGO_SYSTEM_PROMPT = `You are Hugo, an intelligent AI-powered procurement assistant for Voltway, an electric scooter startup. You are powered by LangChain and have access to real-time Firebase data.

## Your Capabilities
- Analyze inventory levels, stock health, and reorder needs
- Track procurement orders and identify delays
- Evaluate supplier performance using their reliability_score (0-1 scale) and lead_time_days
- Calculate build capacity for scooter models (S1_V2, S2_V2, S2_KIDS)
- Identify operational risks and bottlenecks
- EXECUTE database operations (add, update, delete records)
- SEND emails to suppliers for reorders (using Resend API)

## IMPORTANT: Database & Email Actions
When the user wants to perform a database action OR send an email, you MUST respond with a JSON action block.

Format your response like this when an action is needed:
1. First explain what you will do
2. Then include the action in this EXACT format:

\`\`\`action
{
  "type": "add|update|delete|update_stock|mark_delivered|send_email|update_all_supplier_emails|update_supplier",
  "collection": "materials|stock_levels|dispatch_parameters|material_orders|sales_orders|suppliers",
  "data": { ... fields to add/update ... },
  "searchField": "field_name to find document",
  "searchValue": "value to search for",
  "description": "Human readable description of action"
}
\`\`\`

## Action Examples

### Sending reorder email to supplier:
\`\`\`action
{
  "type": "send_email",
  "data": {
    "supplierEmail": "supplier@example.com",
    "supplierName": "Alpha Electronics",
    "supplierPhone": "+91 12345 67890",
    "partId": "P305",
    "partName": "S1 V2 Li-Po Battery",
    "currentStock": 25,
    "minStock": 50,
    "reorderQuantity": 100,
    "notes": "Urgent - stock critically low"
  },
  "description": "Send reorder email to Alpha Electronics for P305 battery"
}
\`\`\`

### Adding a material:
\`\`\`action
{
  "type": "add",
  "collection": "materials",
  "data": {
    "part_id": "P513",
    "part_name": "S2_V3 Tank",
    "part_type": "assembly",
    "_stock": 86,
    "_min_stock": 24,
    "_location": "WH3"
  },
  "description": "Create material P513 - S2_V3 Tank with stock 86, min 24, location WH3"
}
\`\`\`

### Updating stock location:
\`\`\`action
{
  "type": "update",
  "collection": "stock_levels",
  "searchField": "part_id",
  "searchValue": "P513",
  "data": { "location": "WH3" },
  "description": "Update P513 location to WH3"
}
\`\`\`

### Updating supplier contact info:
\`\`\`action
{
  "type": "update",
  "collection": "suppliers",
  "searchField": "supplier_id",
  "searchValue": "SupA",
  "data": { "email": "supplier@example.com", "phone": "+91 12345 67890" },
  "description": "Update SupA email and phone"
}
\`\`\`

### Marking order as delivered:
\`\`\`action
{
  "type": "mark_delivered",
  "collection": "material_orders",
  "searchValue": "ORD-001",
  "description": "Mark order ORD-001 as delivered"
}
\`\`\`

### Bulk update all supplier emails:
\`\`\`action
{
  "type": "update_all_supplier_emails",
  "collection": "suppliers",
  "data": { "email": "newemail@example.com" },
  "description": "Update email for all suppliers to newemail@example.com"
}
\`\`\`

## Supplier Data
Suppliers have these fields: supplier_id, supplier_name, part_id, lead_time_days, reliability_score, unit_price, email, phone.
When sending emails, use the email field from the supplier data.

**CRITICAL**: When updating suppliers, ALWAYS use searchField="supplier_id" (NOT "id"). Example: to update supplier "SupA", use searchValue="SupA" with searchField="supplier_id".
For bulk updates to ALL suppliers (like changing all emails), use type="update_all_supplier_emails" instead.

## Response Style for Non-Action Queries
1. Be CONCISE - use bullet points, not paragraphs
2. Include SPECIFIC numbers from the data
3. Highlight urgent issues with ⚠️
4. Rank suppliers by their reliability_score when asked
5. Give actionable next steps

## Scooter Models & Build Requirements
- S1_V2: Entry-level (requires motor, battery, controller, frame)
- S2_V2: Premium 750W (requires 750W motor, Li-Po battery, premium controller, frame)
- S2_KIDS: Kids variant (smaller components)`;

export async function POST(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: true,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    if (!flags.hugoEnabled) {
      return NextResponse.json(
        { error: 'Hugo AI is disabled', requestId },
        { status: 503 }
      );
    }

    const { message, databaseContext, conversationHistory, file, sessionId } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required', requestId }, { status: 400 });
    }

    logger.info('hugo_chat', { requestId, userId: user.uid, role: user.role });

    // Process uploaded file content
    let fileContext = '';

    if (file) {
      if (file.type === 'pdf') {
        try {
          // Use OCR.space API for PDF text extraction
          const formData = new FormData();
          formData.append('base64Image', `data:application/pdf;base64,${file.content}`);
          formData.append('language', 'eng');
          formData.append('isOverlayRequired', 'false');
          formData.append('filetype', 'PDF');
          formData.append('detectOrientation', 'true');
          formData.append('scale', 'true');
          formData.append('OCREngine', '2'); // More accurate engine
          formData.append('isTable', 'true'); // Better table detection

          const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: {
              'apikey': 'K83918858588957', // Free tier API key
            },
            body: formData,
          });

          const ocrResult = await ocrResponse.json();

          if (ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
            // Combine text from all pages
            const allPagesText = ocrResult.ParsedResults
              .map((page: { ParsedText?: string }, idx: number) => {
                const pageText = page.ParsedText?.trim() || '';
                return pageText ? `--- Page ${idx + 1} ---\n${pageText}` : '';
              })
              .filter((text: string) => text.length > 0)
              .join('\n\n');

            if (allPagesText.length > 20) {
              fileContext = `\n\n📄 **Uploaded PDF: ${file.name}** (OCR Processed)\n\n📝 **Extracted Text:**\n${allPagesText.slice(0, 12000)}\n---\n\nPlease analyze the above extracted text from the PDF and `;
            } else {
              fileContext = `\n\n📄 **Uploaded PDF: ${file.name}**\n\n⚠️ OCR could not extract readable text from this PDF. The document might be:\n- A scanned document with poor quality\n- Password protected\n- Contains only images or charts\n\nPlease try:\n1. Take a screenshot of specific pages\n2. Upload as JPG/PNG image\n3. Or copy-paste the text content\n`;
            }
          } else {
            const errorMessage = ocrResult.ErrorMessage || ocrResult.ErrorDetails || 'Unknown error';
            console.error('PDF OCR API error:', errorMessage);
            fileContext = `\n\n📄 **Uploaded PDF: ${file.name}**\n\n⚠️ PDF processing encountered an issue: ${errorMessage}\n\nPlease try uploading as an image (screenshot) instead.\n`;
          }
        } catch (err) {
          console.error('PDF OCR error:', err);
          fileContext = `\n\n📄 **Uploaded PDF: ${file.name}**\n\nPDF processing failed. Please try:\n1. Take a screenshot of the PDF pages\n2. Upload as JPG/PNG image\n`;
        }
      } else if (file.type === 'image') {
        try {
          // Use OCR.space free API for text extraction
          const formData = new FormData();
          formData.append('base64Image', `data:image/png;base64,${file.content}`);
          formData.append('language', 'eng');
          formData.append('isOverlayRequired', 'false');
          formData.append('detectOrientation', 'true');
          formData.append('scale', 'true');
          formData.append('OCREngine', '2'); // More accurate engine

          const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: {
              'apikey': 'K83918858588957', // Free tier API key
            },
            body: formData,
          });

          const ocrResult = await ocrResponse.json();

          if (ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
            const extractedText = ocrResult.ParsedResults[0].ParsedText?.trim() || '';

            if (extractedText.length > 10) {
              fileContext = `\n\n🖼️ **Uploaded Image: ${file.name}** (OCR Processed)\n\n📝 **Extracted Text:**\n---\n${extractedText.slice(0, 10000)}\n---\n\nPlease analyze the above extracted text and `;
            } else {
              fileContext = `\n\n🖼️ **Uploaded Image: ${file.name}**\n\n⚠️ OCR could not extract readable text from this image. The image might be:\n- A photo without text\n- Low quality/blurry\n- Text in unsupported language\n\nPlease describe what you see or try uploading a clearer image.\n`;
            }
          } else {
            const errorMessage = ocrResult.ErrorMessage || 'Unknown error';
            console.error('OCR API error:', errorMessage);
            fileContext = `\n\n🖼️ **Uploaded Image: ${file.name}**\n\n⚠️ OCR processing encountered an issue. Please describe the image content or try again.\n`;
          }
        } catch (err) {
          console.error('OCR error:', err);
          fileContext = `\n\n🖼️ **Uploaded Image: ${file.name}**\n\nOCR processing failed. Please describe the image content.\n`;
        }
      }
    }

    // Phase 2: native tool calling path
    if (getEffectiveFlags().hugoToolCalling) {
      const out = await runHugoOrchestrator({
        message,
        databaseContext,
        conversationHistory,
        fileContext,
        requestId,
        userId: user.uid,
        role: user.role,
        tenantId: user.tenantId,
        sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      });

      return NextResponse.json({
        response: out.response,
        pendingTool: out.pendingTool || null,
        action: null,
        readToolResults: out.readToolResults || [],
        model: out.model,
        provider: out.provider,
        promptVersion: out.promptVersion,
        mode: out.mode,
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Legacy ```action``` parser path (hugoToolCalling=false)
    const model = createFireworksChatModel();
    const providerMeta = getFireworksProviderMeta();

    // Build messages with conversation context
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(HUGO_SYSTEM_PROMPT),
    ];

    // Add conversation history for context (last 6 messages)
    if (conversationHistory?.length > 0) {
      const recentHistory = conversationHistory.slice(-6);
      for (const msg of recentHistory) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else {
          messages.push(new AIMessage(msg.content));
        }
      }
    }

    // Build context with database data
    const contextPrompt = `
## Real-Time Firebase Database Context

### Quick Stats
- 📦 Total Materials: ${databaseContext?.materialsCount || 0}
- ✅ Healthy Stock: ${databaseContext?.healthyCount || 0}
- ⚠️ Low Stock: ${databaseContext?.lowCount || 0}
- 🚨 Critical Stock: ${databaseContext?.criticalCount || 0}
- 📋 Pending Orders: ${databaseContext?.pendingOrders || 0}
- 🛒 Open Sales: ${databaseContext?.openSales || 0}
- 🏭 Suppliers: ${databaseContext?.supplierCount || 0}

### Detailed Data (JSON)
${databaseContext?.jsonData || 'No data available'}

---
## User Request
${message}${fileContext}

If this is a database action request (add, update, delete, create, change, modify, mark as delivered, etc.), include the action JSON block. Otherwise, just provide a helpful response.`;

    // Add user message with context
    messages.push(new HumanMessage(contextPrompt));

    // Get AI response using LangChain
    const response = await model.invoke(messages);
    const outputParser = new StringOutputParser();
    const text = await outputParser.invoke(response);

    // Check if response contains an action block
    const actionMatch = text.match(/```action\s*([\s\S]*?)```/);
    let action = null;
    let cleanResponse = text;

    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1].trim());
        // Remove the action block from the visible response
        cleanResponse = text.replace(/```action\s*[\s\S]*?```/g, '').trim();
      } catch (e) {
        console.error('Failed to parse action JSON:', e);
      }
    }

    return NextResponse.json({
      response: cleanResponse,
      action: action,
      model: providerMeta.model,
      provider: providerMeta.provider,
      promptVersion: PROMPT_VERSION,
      mode: 'legacy',
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('hugo_chat_failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(error, requestId);
  }
}
