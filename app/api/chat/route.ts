import OpenAI from "openai";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

function isSensitive(text: string) {
  const t = text.toLowerCase();
  const keywords = [
    "självmord", "ta mitt liv", "ta livet av mig", "självskada", "skära mig", "cutta",
    "vill dö", "orkar inte leva",
    "våldt", "övergrepp", "incest", "misshandlar", "slår mig",
    "sex", "naken", "porr", "samlag", "onani",
    "mörda", "döda", "kniv", "pistol", "vapen",
    "heroin", "kokain", "amfetamin", "ecstasy", "droger",
  ];
  return keywords.some((k) => t.includes(k));
}

function safeReplySweden() {
  return [
    "Jag hör dig. Tack för att du säger det här. 🦉",
    "",
    "Det här låter som något som är viktigt att få hjälp med på riktigt – och du ska inte behöva bära det ensam.",
    "",
    "🧡 Om någon är i fara just nu: ring **112**.",
    "🧡 Om du är barn/ungdom och vill prata med en trygg vuxen: **BRIS 116 111** (ring/sms/chatt).",
    "🧡 Om du har tankar på att skada dig själv: **Mind Självmordslinjen 90101** (telefon/chatt).",
    "",
    "Är du trygg där du är just nu? Finns det en vuxen i närheten som du litar på (förälder, lärare, skolkurator)?",
  ].join("\n");
}

const INSTRUCTIONS = `
Du är Ugglan Ollie, en klok och lekfull uggla som hjälper barn (7–15 år) att förstå känslor på ett tryggt och magiskt sätt.

Tonalitet:
- Lugnt, varmt, stöttande, lite lekfullt (Pixar-känsla).
- Kortfattat, tydligt.

NAMN-REGLER (viktigt):
- Använd barnets namn sparsamt.
- Använd namn främst i hälsning eller om du vill trösta extra.
- Använd INTE namnet i varje svar.
- Tumregel: högst 1 gång per ~6 svar och aldrig mer än 1 gång i samma svar.

INTRO-REGLER:
- Presentera dig och fråga efter namn endast om du INTE redan vet namnet.
- Om namnet är känt: hälsa kort och gå direkt till ämnet.

Undvik standardfraser:
- Skriv ALDRIG "Förstår du? Vill du berätta mer om hur du känner just nu?" som standard.
- Variera frågor naturligt eller avsluta utan fråga när det känns klart.

Pedagogik:
- Ofta en mini-berättelse (3–7 meningar) i en trygg fantasiscen.
- 1–3 emojis.
- Efter berättelsen: 2–4 korta, konkreta tips i punktform.

Pixar-känsla:
- Varm humor, mjuka ord, tydlig känslobåge (oro → förståelse → hopp).
- Ollies trygga plats: “Mossiga Gläntan”, med en liten stjärn-lykta.

Säkerhet (barn):
- Vid självskada/självmord/övergrepp/sexualiserat innehåll/grovt våld/akut fara:
  - Var lugn och omtänksam.
  - Ge INTE detaljer eller instruktioner.
  - Uppmana att prata med en betrodd vuxen och söka hjälp.
  - Fråga om barnet är tryggt just nu.
`;

function extractBlock(text: string, tag: "REPLY" | "MEMORY") {
  const start = `<<<${tag}>>>`;
  const end = `<<<END_${tag}>>>`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b <= a) return null;
  return text.slice(a + start.length, b).trim();
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        "OPENAI_API_KEY saknas. Kontrollera .env.local i projektroten och starta om 'npm run dev'.",
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = (await req.json()) as { messages?: Msg[]; memory?: string };
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const memory = (body?.memory ?? "").toString().trim();

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (lastUser && isSensitive(lastUser)) {
      return Response.json({ text: safeReplySweden(), memory });
    }

    const memoryPrefix = memory
      ? `\n\nKORT MINNE OM BARNET (1–3 rader, ej känsligt):\n${memory}\n`
      : "";

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.55,
      top_p: 0.9,
      max_output_tokens: 650,
      instructions:
        INSTRUCTIONS +
        memoryPrefix +
        `
OUTPUT-FORMAT (måste följas exakt):
<<<REPLY>>>
(ditt svar till barnet)
<<<END_REPLY>>>

<<<MEMORY>>>
(uppdatera kort minne: namn + 1–2 relevanta, icke-känsliga saker som hjälper nästa gång. Max 3 rader.)
<<<END_MEMORY>>>
`,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const raw = response.output_text ?? "";
    const reply = extractBlock(raw, "REPLY") ?? raw.trim();
    const newMemory = extractBlock(raw, "MEMORY") ?? memory;

    return Response.json({ text: reply, memory: newMemory });
  } catch (err: any) {
    return new Response(err?.message ?? "Server error", { status: 500 });
  }
}