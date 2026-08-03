import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import { createFireworksChatModel } from '@/lib/hugo/providers/fireworks';
import { HUGO_SYSTEM_PROMPT_V2, PROMPT_VERSION } from '@/lib/hugo/prompts';
import { flags } from '@/lib/config';
import { logger } from '@/lib/observability/logger';
import { toLangChainTools } from '@/lib/hugo/tools/registry';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: true,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    if (!flags.hugoEnabled) {
      return NextResponse.json({ error: 'Hugo AI is disabled', requestId }, { status: 503 });
    }

    const { message, databaseContext, conversationHistory } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required', requestId }, { status: 400 });
    }

    logger.info('hugo_stream', {
      requestId,
      userId: user.uid,
      promptVersion: PROMPT_VERSION,
    });

    const model = createFireworksChatModel({ maxTokens: 2048 });
    const runnable = flags.hugoToolCalling
      ? model.bindTools(toLangChainTools())
      : model;

    const messages: Array<SystemMessage | HumanMessage | AIMessage> = [
      new SystemMessage(HUGO_SYSTEM_PROMPT_V2),
    ];
    if (conversationHistory?.length) {
      for (const msg of conversationHistory.slice(-6)) {
        if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
        else messages.push(new AIMessage(msg.content));
      }
    }
    messages.push(
      new HumanMessage(
        `Context stats: materials=${databaseContext?.materialsCount ?? 0}, critical=${databaseContext?.criticalCount ?? 0}, low=${databaseContext?.lowCount ?? 0}\n\nUser: ${message}\n\nStream a concise answer. For mutations, tell the user to use the main chat confirm flow.`
      )
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          send('meta', { requestId, promptVersion: PROMPT_VERSION });
          const iterable = await runnable.stream(messages);
          for await (const chunk of iterable) {
            const content = chunk.content;
            const token =
              typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content.map((c) => ('text' in c ? String(c.text) : '')).join('')
                  : '';
            if (token) send('token', { token });
          }
          send('done', { ok: true, requestId });
          controller.close();
        } catch (e) {
          send('error', {
            error: e instanceof Error ? e.message : 'Stream failed',
            requestId,
          });
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
