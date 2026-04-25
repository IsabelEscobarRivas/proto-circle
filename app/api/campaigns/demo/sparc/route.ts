import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

function validKey(raw: string | undefined) {
  return !!raw && raw !== "your_key_here" && raw.trim() !== "";
}

function getFallback(name: string) {
  return `Hi! I'm SpArc, your AI campaign strategist. I'm here to help you craft the perfect creator brief for **${name}**.

Here's my first draft:

🎯 **PITCH:** Real creators. Real engagement. Instant USDC — verified on-chain.

📋 **WHAT CREATORS DO:** Share your unique campaign link. Drive clicks and conversions from your audience.

💸 **HOW YOU EARN:** $0.01 USDC instantly per click. Plus an attributed share of $0.20 on every conversion — paid automatically on-chain via Circle, no invoices, no delays.

⚡ **WHY IT MATTERS:** ${name} pays creators the moment engagement happens — not 30 days later.

What would you like to refine? I can make it more targeted, more exciting, or tailored to a specific creator niche.`;
}

type Turn = { role: string; content: string };

export async function POST(req: Request) {
  let campaignName = "Campaign";
  let budget = "";
  let payoutTerms = "$0.01/click · $0.20 conversion";
  let messages: Turn[] = [];

  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.campaignName === "string") campaignName = body.campaignName;
    if (typeof body.budget === "string") budget = body.budget;
    if (typeof body.payoutTerms === "string") payoutTerms = body.payoutTerms;
    const raw = body["messages"];
    if (Array.isArray(raw)) {
      messages = raw.filter(
        (m): m is Turn =>
          m != null &&
          typeof m === "object" &&
          typeof (m as Turn).role === "string" &&
          typeof (m as Turn).content === "string",
      );
    }
  } catch {
    return NextResponse.json({ reply: getFallback("Campaign") });
  }

  if (messages.length === 0) {
    return NextResponse.json({ reply: getFallback(campaignName) });
  }

  const rawKey = process.env.GEMINI_API_KEY;
  if (!validKey(rawKey)) {
    return NextResponse.json({ reply: getFallback(campaignName) });
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return NextResponse.json({ reply: getFallback(campaignName) });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: rawKey! });

    const systemInstruction = `You are SpArc, an AI campaign strategist for a creator economy platform built on Arc blockchain with Circle USDC payments.

You are helping a campaign manager craft and refine a creator brief for their campaign.

Campaign context:
- Name: ${campaignName}
- Budget: ${budget}
- Payout terms: ${payoutTerms}

Your personality: strategic, sharp, encouraging, concise. You speak directly to the campaign manager.
You remember everything discussed in this conversation.
You proactively suggest improvements.
When generating a brief, always include:
1. A punchy one-line pitch
2. What creators should do
3. How creators earn (clicks = instant USDC, conversions = attributed share)
4. Why this campaign matters

Keep responses focused and actionable. Never generic.`;

    const history = messages.slice(0, -1).map((m: Turn) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: { systemInstruction },
      history,
    });

    const response = await chat.sendMessage({ message: last.content });

    return NextResponse.json({
      reply: response.text ?? getFallback(campaignName),
    });
  } catch (e) {
    console.error("SpArc error:", e);
    return NextResponse.json({ reply: getFallback(campaignName) });
  }
}
