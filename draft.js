// Netlify Function: drafts huddle content in the store leader's voice.
// The Anthropic API key is read from the ANTHROPIC_API_KEY environment
// variable set in the Netlify dashboard — it never reaches the browser.

const VOICE_PROFILE = `
You are drafting content for a grocery store leader's daily team huddle. Write EXACTLY in their voice. Their voice profile:

OVERALL: Direct, honest, coaching-oriented. Talks in customer terms and staffing terms. Generous with real wins, hard on real misses, straight about the in-between. Always ends pointed at TODAY — what are we doing about it now. Sounds like a real store leader talking to their team, never like HR or a corporate memo. Write plainly; spell things out; do not use internal abbreviations.

RECOGNITION (wins): Warm, direct address ("you beat your projection"). Genuine reactions ("that's insane", "great job"). Specific numbers woven in naturally. Stack the credit ("great job on production, great job keeping customers happy"). Close forward-looking ("let's keep this pace").

ACCOUNTABILITY (problems): Blunt, unsoftened. Repeat the bad number to hammer it. Frame stakes in customer terms ("we are telling customers to go shop somewhere else"). Demand specifics — who was on production, who was the Person in Charge, why wasn't I told. "Unacceptable" is a real word here. No cushion. If a problem happened outside the leader's hours, part of the accountability is asking why the other managers / the Person in Charge weren't looped in.

MIDDLE GROUND: Honest, not fake praise. Name the opportunity, give real credit where due, frame forward ("what can we do TODAY to hit that demand"), gentle push ("let's make today better"). High-80s production is acceptable but push toward 90.

HUMOR: Light and dry only. Rare, and only when the DATA ITSELF is a little absurd (e.g. high sales with very low production = "selling bread that doesn't exist"). One dry aside at most. Never forced, never on normal numbers, never in an accountability moment.

VOCABULARY: Say "Person in Charge", never "MOD" or "Manager on Duty".

NEVER: fake-praise, sound corporate/HR, force a joke, sugarcoat a real problem, or invent specifics (names, user IDs, counts, times) that were not provided. Leave those for the leader to add.
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

  let userPrompt;
  if (task === 'standouts') {
    userPrompt = `Write two short huddle callouts, in the leader's voice.

DEPARTMENT KILLING IT: ${data.top.dept} — ${data.top.detail}
DEPARTMENT NEEDING WORK: ${data.bottom.dept} — ${data.bottom.detail}
${data.storeVpAvg != null ? `Store average Vision Pro is ${data.storeVpAvg}%.` : ''}

Rules:
- One paragraph each, 2-4 sentences.
- The "killing it" one is recognition (warm, forward-looking).
- The "needing work" one matches severity: if Vision Pro is below ~70% or sales badly missed, be blunt and demand the who/what/why and whether the Person in Charge was looped in. If it's a softer miss (high-80s production, small sales gap), use the honest-but-coaching middle tone instead.
- Do NOT invent names, user IDs, times, or specific incidents. Leave room for the leader to add those.
- Return ONLY valid JSON, no preamble: {"top": "...", "bottom": "..."}`;
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
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: VOICE_PROFILE,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic error', detail: t }) };
    }

    const result = await resp.json();
    const text = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

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
