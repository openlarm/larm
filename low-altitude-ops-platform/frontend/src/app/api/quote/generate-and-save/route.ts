import { NextResponse } from "next/server"
import { generateQuotePdf } from "@/lib/line/generate-quote-pdf"
import type { QuotePdfInput } from "@/lib/line/generate-quote-pdf"
import { getSupabaseAdmin } from "@/lib/supabase/client"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QuotePdfInput

    // ── Validate required fields ───────────────────────────────────────────
    if (!body.pricing?.quote_code || !body.timeResult || !body.formData || !body.areaEstimate) {
      return NextResponse.json(
        { error: "Missing required fields: pricing, timeResult, formData, areaEstimate" },
        { status: 400 },
      )
    }

    const quoteCode = body.pricing.quote_code

    // ── Generate PDF ───────────────────────────────────────────────────────
    const pdfBuffer = generateQuotePdf(body)

    // ── Upload to Supabase Storage ─────────────────────────────────────────
    const supabase = getSupabaseAdmin()
    const pdfPath = `quotes/${quoteCode}.pdf`

    const { error: uploadError } = await supabase.storage
      .from("quote-pdfs")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError)
      return NextResponse.json(
        { error: "Failed to upload PDF" },
        { status: 500 },
      )
    }

    // ── Get public URL ─────────────────────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from("quote-pdfs")
      .getPublicUrl(pdfPath)

    const pdfUrl = urlData.publicUrl

    // ── Save quote record to DB ────────────────────────────────────────────
    const numBuildings = body.formData.numBuildings ?? 1
    const totalArea =
      body.areaEstimate.project_total_m2 ??
      body.areaEstimate.total_area_m2 * numBuildings

    const { error: dbError } = await supabase.from("quotes").upsert(
      {
        quote_code: quoteCode,
        pdf_path: pdfPath,
        pdf_url: pdfUrl,
        total_ntd: body.pricing.total,
        suggested_days: body.timeResult.suggested_days,
        building_type: body.formData.buildingType,
        floors: body.formData.floors,
        total_area_m2: totalArea,
        address: body.formData.address ?? null,
        valid_until: body.pricing.valid_until,
      },
      { onConflict: "quote_code" },
    )

    if (dbError) {
      console.error("Supabase DB insert error:", dbError)
      // PDF is already uploaded, so we can still return success
      // The webhook can fall back to storage lookup
    }

    return NextResponse.json({
      quoteCode,
      pdfUrl,
    })
  } catch (err) {
    console.error("Quote generate-and-save error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
