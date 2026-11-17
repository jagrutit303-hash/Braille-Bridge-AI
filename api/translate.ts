// Vercel Serverless Function for Multilingual Translation
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, targetLang, sourceLang = "en" } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text to translate" });
    }

    const targetShort = (targetLang || "en").split("-")[0].toLowerCase();
    const sourceShort = (sourceLang || "en").split("-")[0].toLowerCase();

    if (targetShort === sourceShort) {
      return res.json({ translatedText: text, targetLang });
    }

    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceShort
    )}&tl=${encodeURIComponent(targetShort)}&dt=t&q=${encodeURIComponent(text.trim())}`;

    const r = await fetch(gtxUrl);
    if (!r.ok) throw new Error(`GTX HTTP ${r.status}`);
    const json: any = await r.json();
    const translatedText = Array.isArray(json?.[0])
      ? json[0].map((item: any) => (Array.isArray(item) ? item[0] : "")).join("")
      : text;

    return res.json({ translatedText: (translatedText || text).trim(), targetLang });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Translation failed" });
  }
}

