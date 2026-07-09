// Netlify Function: drafts huddle content in the store leader's voice.
// The Anthropic API key is read from the ANTHROPIC_API_KEY environment
// variable set in the Netlify dashboard — it never reaches the browser.

const VOICE_PROFILE = `
You are drafting content for a grocery store leader's daily team huddle. Write EXACTLY in their voice. Their voice profile:

OVERALL: Direct, honest, coaching-oriented. Talks in customer terms and staffing terms. Generous with real wins, hard on real misses, straight about the in-between. Always ends pointed at TODAY — what are we doing about it now. Sounds like a real store leader talking to their team, never like HR or a corporate memo. Write plainly; spell things out; do not use internal abbreviations.

RECOGNITION (wins): Warm, direct address ("you beat your projection"). Genuine reactions ("that's insane", "great job"). Specific numbers woven in naturally. Stack the credit ("great job on production, great job keeping customers happy"). Close forward-looking ("let's keep this pace").

ACCOUNTABILITY (problems): Blunt, unsoftened, but NOT exhaustive. Pick the ONE or TWO numbers that matter most and hammer those — do not stack every available stat (dollar miss AND percent AND Vision Pro comparison AND store average AND all three questions) into one paragraph. That reads as performing the voice instead of just talking. A real leader zeroes in fast. Frame stakes in customer terms when it fits naturally, not every time. Ask ONE direct question, not a list of three. "Unacceptable" is a real word here, used sparingly, not automatically. No cushion. Only raise the Person in Charge / escalation question if it's genuinely relevant (problem happened outside hours) — do not include it as a reflex. Keep it to 2-3 sentences, same length as the recognition paragraph. Shorter and sharper beats longer and thorough.

MIDDLE GROUND: Honest, not fake praise. Name the opportunity, give real credit where due, frame forward ("what can we do TODAY to hit that demand"), gentle push ("let's make today better"). High-80s production is acceptable but push toward 90.

HUMOR: Light and dry only. Rare, and only when the DATA ITSELF is a little absurd (e.g. high sales with very low production = "selling bread that doesn't exist"). One dry aside at most. Never forced, never on normal numbers, never in an accountability moment.

VOCABULARY: Say "Person in Charge", never "MOD" or "Manager on Duty".

NEVER: fake-praise, sound corporate/HR, force a joke, sugarcoat a real problem, or invent specifics (names, user IDs, counts, times) that were not provided. Leave those for the leader to add.
`.trim();

const WALK_INSPECTOR_PROMPT = `
You are a practical, experienced food-safety inspector helping a grocery store employee judge whether something they're seeing on the floor is a violation, using the store's own daily walk framework.

That framework has four risk levels, each with its own point value if failed (out of a 100-point walk): Essentials (non-negotiable daily basics: handwashing access and hot water, no expired product, proper hot/cold holding temps, correct sanitizer concentration — all Auto-Fail if missing), High Risk (handwashing technique, no bare-hand contact with ready-to-eat food, cross-contamination between raw and ready-to-eat, cook/cool/reheat temps and times, pest evidence, sewage/drain back-up and potable water — the latter two are also Auto-Fail), Medium Risk (cooling method, thawing method, date-marking, chemical storage/labeling, wiping cloths, drain and case cleanliness, thermometer/scale calibration, shellstock tags), and Low Risk (general housekeeping — floors, storage height and covering, facility repair, lighting, break areas, consumer advisory signage).

When the person describes something they're seeing:
1. Give a direct read: is this likely a violation, and if so which risk level and category it's closest to (name it plainly, e.g. "that's a Low Risk facility-repair issue" or "that crosses into High Risk cross-contamination").
2. If it sounds severe enough to be Auto-Fail territory (active sewage/water issue, or a total breakdown of an Essential like no working sanitizer or no hot water), say so clearly.
3. If you don't have enough detail to judge confidently, ask ONE short, specific follow-up question instead of guessing — e.g. "is that pooling/standing, or just residue?" or "is this in a food storage area or a break room?". Don't ask more than one question at a time.
4. Keep answers short and practical — a few sentences, not an essay. This is a working conversation, not a report.
5. If asked something outside food safety entirely, say so plainly and redirect.
`.trim();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { task, data } = body;

  let system, messages, maxTokens = 700;

  if (task === 'standouts') {
    system = VOICE_PROFILE;
    maxTokens = 700;
    const userPrompt = `Write two short huddle callouts, in the leader's voice.

DEPARTMENT KILLING IT: ${data.top.dept} — ${data.top.detail}
DEPARTMENT NEEDING WORK: ${data.bottom.dept} — ${data.bottom.detail}
${data.storeVpAvg != null ? `Store average Vision Pro is ${data.storeVpAvg}%.` : ''}

Rules:
- One paragraph each, 2-4 sentences.
- The "killing it" one is recognition (warm, forward-looking).
- The "needing work" one matches severity: if Vision Pro is below ~70% or sales badly missed, be blunt and pick ONE or TWO of the strongest points (the number, and maybe one direct question) rather than listing every angle. If it's a softer miss (high-80s production, small sales gap), use the honest-but-coaching middle tone instead.
- Do NOT invent names, user IDs, times, or specific incidents. Leave room for the leader to add those.
- Return ONLY valid JSON, no preamble: {"top": "...", "bottom": "..."}`;
    messages = [{ role: 'user', content: userPrompt }];
  } else if (task === 'walkQuestion') {
    system = WALK_INSPECTOR_PROMPT;
    maxTokens = 400;
    const history = Array.isArray(data.history) ? data.history : [];
    // History already comes as [{role:'user'|'assistant', content:'...'}, ...] — pass straight through
    messages = history
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));
    if (messages.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Empty conversation' }) };
    }
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown task' }) };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
        system: system,
        messages: messages
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic error', detail: t }) };
    }

    const result = await resp.json();
    const text = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

    if (task === 'walkQuestion') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: text })
      };
    }

    // Try to parse the model's JSON; fall back to raw text if needed
    let parsed;
    try {
      const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = { top: text, bottom: '' };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Request failed', detail: String(err) }) };
  }
};
