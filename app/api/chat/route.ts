import OpenAI from "openai";

export const runtime = "nodejs"; // viktigt på Vercel för vissa beroenden

type Role = "user" | "assistant";
type IncomingMsg = { role: Role; content: string };

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Modellen instrueras att returnera:
 * <reply-text>
 * <<<MEMORY>>>
 * <memory-text>
 * <<<END_MEMORY>>>
 *
 * Den här funktionen separerar text (för UI) från minne (för storage).
 */
function parseModelResponse(raw: string) {
  const memoryMatch = raw.match(/<<<MEMORY>>>([\s\S]*?)<<<END_MEMORY>>>/);
  const memory = memoryMatch ? memoryMatch[1].trim() : null;

  let text = raw.replace(/<<<MEMORY>>>[\s\S]*?<<<END_MEMORY>>>/g, "");
  text = text.replace(/<<<END_REPLY>>>/g, ""); // om någon gammal prompt ligger kvar
  text = text.trim();

  return { text, memory };
}

/**
 * En enkel, praktisk säkerhetsfilter-heuristik för barn-app.
 * (Inte perfekt, men gör att vi kan ge ett tryggt svar och stoppa olämpligt innehåll.)
 */
function detectSensitive(text: string) {
  const t = text.toLowerCase();

  const selfHarm =
    /\b(självmord|suicid|ta mitt liv|ta livet av mig|skära mig|skada mig själv|självskada|vill dö)\b/.test(t);

  const sexual =
    /\b(sex|samlag|porr|naken|snopp|snippa|penis|vagina|onani|ligga med)\b/.test(t);

  const violence =
    /\b(döda|mörda|kniv|skjuta|våldta|spränga|bomba|slå ihjäl)\b/.test(t);

  const drugs =
    /\b(knark|droger|cannabis|hasch|gräs|kokain|heroin|amfetamin|ecstasy|lsd)\b/.test(t);

  if (selfHarm) return { type: "self_harm" as const };
  if (sexual) return { type: "sexual" as const };
  if (violence) return { type: "violence" as const };
  if (drugs) return { type: "drugs" as const };

  return null;
}

function safetyReply(kind: "self_harm" | "sexual" | "violence" | "drugs") {
  if (kind === "self_harm") {
    return {
      text:
        "Oj… det där låter som en tung känsla. 🦉\n" +
        "Jag kan inte hjälpa till med saker som handlar om att skada sig själv, men jag vill att du ska få hjälp på riktigt.\n\n" +
        "Kan du säga till en vuxen du litar på direkt (förälder, annan vuxen hemma, lärare eller skolkurator)?\n" +
        "Om du är i fara just nu: ring **112**.\n\n" +
        "Vill du berätta: är det här en *just-nu-känsla*, eller har det varit så ett tag?",
      memory:
        "Känsligt ämne: självskadetankar nämndes. Rekommenderade vuxenstöd och 112 vid akut fara.",
    };
  }

  if (kind === "sexual") {
    return {
      text:
        "Jag hör dig. 🦉\n" +
        "Men jag kan inte prata om sexuella saker här. Om du undrar något om kroppen eller gränser kan det vara bäst att prata med en trygg vuxen (förälder, skolsköterska eller kurator).\n\n" +
        "Vill du istället berätta vad du *kände* i situationen (t.ex. obehag, nyfikenhet, oro)?",
      memory:
        "Känsligt ämne: sexualitet/sex nämndes. Svarade med gräns och hänvisning till trygg vuxen.",
    };
  }

  if (kind === "violence") {
    return {
      text:
        "Jag kan inte hjälpa till med våld eller hur man skadar någon. 🦉\n" +
        "Men jag kan hjälpa dig med känslan bakom (ilska, rädsla, stress).\n\n" +
        "Om du känner att du kan tappa kontrollen: gå bort från situationen och be en vuxen om hjälp direkt.\n" +
        "Vill du säga vad som hände precis innan det kändes så?",
      memory:
        "Känsligt ämne: våld nämndes. Svarade med gräns och fokus på känsloreglering + vuxenstöd.",
    };
  }

  // drugs
  return {
    text:
      "Jag kan inte hjälpa till med droger eller sånt. 🦉\n" +
      "Men jag kan hjälpa dig att hantera press, nyfikenhet eller oro.\n\n" +
      "Var det någon som försökte få dig att göra något du inte ville?",
    memory:
      "Känsligt ämne: droger nämndes. Svarade med gräns och frågor om press/trygghet.",
  };
}

/**
 * Plocka ett namn ur tidigare minne om det finns (enklast möjliga).
 * Minne är fri text, så vi försöker bara hitta rad som ser ut som "Namn: X".
 */
function extractNameFromMemory(memory: string | undefined) {
  if (!memory) return null;
  const m = memory.match(/(?:^|\n)\s*Namn\s*:\s*([A-Za-zÅÄÖåäö\-']{2,})\s*(?:$|\n)/i);
  if (!m?.[1]) return null;
  const n = m[1].trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonError(
        "OPENAI_API_KEY saknas. Kontrollera att .env.local ligger i projektroten och starta om `npm run dev`.",
        500
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) return jsonError("Ogiltig JSON i request body.", 400);

    const messages = (body.messages ?? []) as IncomingMsg[];
    const memoryFromClient = (body.memory ?? "") as string;

    // Enkelt skydd: sista user-meddelandet för snabb heuristik
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const sensitive = detectSensitive(lastUser);
    if (sensitive) {
      const safe = safetyReply(sensitive.type);
      return new Response(JSON.stringify({ text: safe.text, memory: safe.memory }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const knownName = extractNameFromMemory(memoryFromClient) ?? null;

    const client = new OpenAI({ apiKey });

    const system = [
      "Du är Ugglan Ollie: en klok, varm och lekfull uggla som hjälper barn (7–15) att förstå känslor.",
      "Du pratar enkelt, tryggt och konkret. Korta stycken. Emoji sparsamt (1–2 per svar).",
      "Du använder små liknelser och miniberättelser ibland för pedagogik (t.ex. 'Mossiga Gläntan' som trygg plats).",
      "Du ställer EN bra följdfråga per svar. Undvik förminskande formuleringar som 'Förstår du?' och undvik att alltid fråga 'Vill du berätta mer?'",
      "Du frågar inte om namn varje gång. Om namn redan finns: använd det bara ibland (max var 4–5:e svar).",
      "Du ger inga medicinska/sexuella/våldsamma instruktioner. Vid känsliga ämnen: uppmuntra trygg vuxen och fokusera på känslor och säkerhet.",
      "",
      "VIKTIGT OUTPUTFORMAT:",
      "Svara i två delar: först själva svaret till barnet.",
      "Sedan (på ny rad) skriv exakt:",
      "<<<MEMORY>>>",
      "och skriv en kort minnesnotis i fri text (max 2–3 rader) som kan hjälpa nästa samtal. Om inget nytt: skriv 'Ingen uppdatering.'",
      "Avsluta med:",
      "<<<END_MEMORY>>>",
      "",
      knownName
        ? `Tidigare namn kan vara: ${knownName}. Om barnet skriver sitt namn, uppdatera minnet som 'Namn: <namn>'.`
        : "Om barnet skriver sitt namn (t.ex. 'Jag heter Lisa'), uppdatera minnet som 'Namn: <namn>'.",
      memoryFromClient
        ? `Tidigare minne (kan vara tomt eller kort):\n${memoryFromClient}`
        : "Tidigare minne: (tomt)",
    ].join("\n");

    // Vi skickar hela chatten, men system först.
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6, // lugnare / stabilare
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelResponse(raw);

    // Extra fallback: om modellen glömde memory-taggen, spara inget
    const outText = parsed.text || "Oj! Jag tappade bort orden en sekund. Vill du säga det igen?";
    const outMemory = parsed.memory ?? "Ingen uppdatering.";

    return new Response(JSON.stringify({ text: outText, memory: outMemory }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Vanliga OpenAI-fel (rate limit etc.)
    const msg =
      typeof err?.message === "string"
        ? err.message
        : "Okänt serverfel.";

    return jsonError(msg, 500);
  }
}