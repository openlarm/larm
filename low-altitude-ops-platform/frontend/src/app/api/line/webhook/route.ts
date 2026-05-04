import { NextResponse } from "next/server"
import { verifyLineSignature, replyQuotePdf, pushWelcomeMessage } from "@/lib/line/line-client"
import { getSupabaseAdmin } from "@/lib/supabase/client"

export const runtime = "nodejs"

// ─── LINE Webhook Types ──────────────────────────────────────────────────────

interface LineEvent {
  type: string
  replyToken?: string
  source?: { type: string; userId?: string }
  message?: { type: string; text?: string }
}

interface LineWebhookBody {
  events: LineEvent[]
}

// ─── Quote code pattern: Q-YYYYMMDD-NNN ──────────────────────────────────────

const QUOTE_CODE_RE = /Q-\d{8}-\d{3,}/

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()

    // ── Signature verification ─────────────────────────────────────────────
    const signature = request.headers.get("x-line-signature")
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 })
    }

    try {
      if (!verifyLineSignature(rawBody, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    } catch {
      // If LINE_CHANNEL_SECRET is not set, log and skip verification in dev
      console.warn("LINE signature verification skipped (missing secret?)")
    }

    const body = JSON.parse(rawBody) as LineWebhookBody

    // ── Process events ─────────────────────────────────────────────────────
    for (const event of body.events) {
      if (event.type === "follow" && event.source?.userId) {
        await handleFollow(event.source.userId)
      } else if (
        event.type === "message" &&
        event.message?.type === "text" &&
        event.message.text &&
        event.replyToken
      ) {
        await handleTextMessage(event.replyToken, event.message.text)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("LINE webhook error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ─── Event handlers ──────────────────────────────────────────────────────────

async function handleFollow(userId: string) {
  try {
    await pushWelcomeMessage(userId)
  } catch (err) {
    console.error("Failed to send welcome message:", err)
  }
}

async function handleTextMessage(replyToken: string, text: string) {
  const match = text.match(QUOTE_CODE_RE)
  if (!match) return // Not a quote code request — ignore

  const quoteCode = match[0]

  try {
    const supabase = getSupabaseAdmin()

    // Look up quote in DB
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("quote_code, pricing, time_result, expires_at, pdf_url")
      .eq("quote_code", quoteCode)
      .single()

    if (error || !quote) {
      // Quote not found — reply with helpful message
      const { messagingApi: api } = await import("@line/bot-sdk")
      const client = new api.MessagingApiClient({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
      })
      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `找不到報價單 ${quoteCode} 😕\n\n請確認編號是否正確，或至 larm.drone168.com/quote 重新取得報價。`,
          },
        ],
      })
      return
    }

    // Reply with quote Flex Message + PDF download link
    const pricing = quote.pricing as { total: number; valid_until: string }
    const timeResult = quote.time_result as { suggested_days: number }

    await replyQuotePdf(replyToken, {
      quoteCode: quote.quote_code as string,
      totalNtd: pricing.total,
      suggestedDays: timeResult.suggested_days,
      pdfUrl: quote.pdf_url as string,
      validUntil: (quote.expires_at as string) ?? pricing.valid_until,
    })
  } catch (err) {
    console.error(`Failed to handle quote ${quoteCode}:`, err)
  }
}
