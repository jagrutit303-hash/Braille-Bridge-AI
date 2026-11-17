// Vercel Serverless Function for Multilingual Text-to-Speech Streaming
// Supports Kannada (kn), Hindi (hi), Tamil (ta), Bengali (bn), English (en)
export default async function handler(req: any, res: any) {
  try {
    const text = (req.query?.text as string) || "";
    const lang = (req.query?.lang as string) || "en";

    if (!text || !text.trim()) {
      return res.status(400).send("Missing text parameter");
    }

    const shortLang = lang.split("-")[0].toLowerCase();
    const cleanText = text.slice(0, 300).trim();

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(
      shortLang
    )}&client=tw-ob&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(ttsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send("TTS audio fetch failed");
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(500).send("Internal server TTS error: " + err?.message);
  }
}

