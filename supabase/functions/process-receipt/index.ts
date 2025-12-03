/**
 * Supabase Edge Function: Process Receipt OCR
 *
 * This function securely processes receipt images using Google Vision API.
 * The Google API key is stored as a secret and never exposed to the client.
 *
 * @param {string} image_base64 - Base64 encoded image data
 * @returns {OcrResult} Extracted receipt data with confidence scores
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

interface OcrRequest {
  image_base64: string;
  receipt_id?: string;
}

interface OcrResult {
  merchant: string | null;
  amount: number | null;
  date: string | null;
  tax: number | null;
  currency: string | null;
  rawText: string;
  confidence: {
    overall: number;
    merchant: number;
    amount: number;
    date: number;
    tax: number;
    currency: number;
  };
}

// Currency symbol to code mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "R$": "BRL",
  "C$": "CAD",
  "A$": "AUD",
};

// Currency keyword to code mapping
const CURRENCY_KEYWORDS: Record<string, string> = {
  "USD": "USD",
  "EUR": "EUR",
  "GBP": "GBP",
  "EURO": "EUR",
  "DOLLAR": "USD",
  "POUND": "GBP",
};

// Allowed origins (production and development)
const ALLOWED_ORIGINS = [
  "https://bfudcugrarerqvvyfpoz.supabase.co", // Supabase project URL
  "https://yourapp.com",           // Production domain (when deployed)
  "https://www.yourapp.com",       // Production www domain (when deployed)
  "http://localhost:4200",         // Angular dev server
  "http://localhost:3000",         // Alternative dev port
];

/**
 * Get CORS headers with origin validation
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".netlify.app"))
    ? origin
    : ALLOWED_ORIGINS[0]; // Default to first allowed origin

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Initialize Supabase client to verify user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse request body
    const { image_base64, receipt_id }: OcrRequest = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: "Missing image_base64 parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get Google Vision API key from environment (secure)
    const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!apiKey) {
      console.error("GOOGLE_VISION_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "OCR service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Call Google Vision API
    const visionResponse = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: image_base64,
            },
            features: [
              {
                type: "TEXT_DETECTION",
                maxResults: 1,
              },
            ],
          },
        ],
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error("Vision API error:", errorText);
      return new Response(
        JSON.stringify({ error: "OCR processing failed", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const visionData = await visionResponse.json();

    // Extract text from Vision API response
    const textAnnotations = visionData.responses?.[0]?.textAnnotations;
    const rawText = textAnnotations?.[0]?.description || "";

    // Parse the extracted text
    const ocrResult = parseReceiptText(rawText);

    // Update receipt record if receipt_id provided
    if (receipt_id) {
      const { error: updateError } = await supabaseClient
        .from("receipts")
        .update({
          ocr_data: {
            ...ocrResult,
            processed_at: new Date().toISOString(),
            user_id: user.id,
          },
          extracted_merchant: ocrResult.merchant,
          extracted_amount: ocrResult.amount,
          extracted_date: ocrResult.date,
          extracted_tax: ocrResult.tax,
          extracted_currency: ocrResult.currency,
          ocr_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", receipt_id)
        .eq("user_id", user.id); // Ensure user owns the receipt

      if (updateError) {
        console.error("Failed to update receipt:", updateError);
        // Don't fail the request, just log the error
      }
    }

    return new Response(JSON.stringify(ocrResult), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

/**
 * Extract currency from receipt text
 */
function extractCurrency(text: string, hasAmounts: boolean): { currency: string | null; confidence: number } {
  const upperText = text.toUpperCase();

  // First, look for explicit currency codes (USD, EUR, GBP, etc.)
  for (const [keyword, code] of Object.entries(CURRENCY_KEYWORDS)) {
    if (upperText.includes(keyword)) {
      return { currency: code, confidence: 0.90 };
    }
  }

  // Then, look for currency symbols ($, €, £, etc.)
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      return { currency: code, confidence: 0.85 };
    }
  }

  // Default to USD if amounts found but no currency symbol
  if (hasAmounts) {
    return { currency: "USD", confidence: 0.50 };
  }

  return { currency: null, confidence: 0 };
}

/**
 * Parse extracted text to identify receipt fields
 */
function parseReceiptText(text: string): OcrResult {
  const lines = text.split("\n").map((line) => line.trim());

  // Initialize result
  const result: OcrResult = {
    merchant: null,
    amount: null,
    date: null,
    tax: null,
    currency: null,
    rawText: text,
    confidence: {
      overall: 0,
      merchant: 0,
      amount: 0,
      date: 0,
      tax: 0,
      currency: 0,
    },
  };

  // Extract merchant (usually first line)
  if (lines.length > 0) {
    result.merchant = lines[0];
    result.confidence.merchant = 0.85; // High confidence for first line
  }

  // Extract amount (look for dollar amounts)
  const amountPattern = /\$?\s*(\d+\.\d{2})|(\d+\.\d{2})/g;
  const amounts: number[] = [];

  for (const line of lines) {
    const matches = line.matchAll(amountPattern);
    for (const match of matches) {
      const amount = parseFloat(match[1] || match[2]);
      if (amount > 0 && amount < 10000) {
        amounts.push(amount);
      }
    }
  }

  // Use the largest amount as total (common pattern)
  if (amounts.length > 0) {
    result.amount = Math.max(...amounts);
    result.confidence.amount = 0.75;
  }

  // Extract date (various formats)
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/, // MM/DD/YYYY or M/D/YY
    /(\d{1,2}-\d{1,2}-\d{2,4})/, // MM-DD-YYYY
    /(\d{4}-\d{2}-\d{2})/, // YYYY-MM-DD
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i, // Month DD, YYYY
  ];

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        result.date = normalizeDate(match[0]);
        result.confidence.date = 0.80;
        break;
      }
    }
    if (result.date) break;
  }

  // Extract tax (look for "tax" keyword)
  for (const line of lines) {
    if (/tax/i.test(line)) {
      const taxMatch = line.match(/\$?\s*(\d+\.\d{2})/);
      if (taxMatch) {
        result.tax = parseFloat(taxMatch[1]);
        result.confidence.tax = 0.70;
        break;
      }
    }
  }

  // Extract currency
  const currencyResult = extractCurrency(text, amounts.length > 0);
  result.currency = currencyResult.currency;
  result.confidence.currency = currencyResult.confidence;

  // Calculate overall confidence
  const confidenceValues = [
    result.confidence.merchant,
    result.confidence.amount,
    result.confidence.date,
    result.confidence.tax,
    result.confidence.currency,
  ].filter((c) => c > 0);

  result.confidence.overall = confidenceValues.reduce((sum, c) => sum + c, 0) /
    confidenceValues.length;

  return result;
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(dateString: string): string | null {
  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch (e) {
    console.error("Date parsing error:", e);
  }
  return null; // Return null if parsing fails
}
