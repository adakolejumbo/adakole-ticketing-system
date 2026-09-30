// Optional AI triage using the Anthropic Messages API.
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export async function aiTriage(ticket, categories) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:
          'You triage IT support tickets for a managed service provider. Reply with only a JSON object: ' +
          '{"category": one of the given categories, "priority": "low"|"normal"|"high"|"urgent", "tags": up to 3 short lowercase tags}. ' +
          'Urgent means many users down or a security incident. No other text.',
        messages: [
          {
            role: 'user',
            content: `Categories: ${categories.map((c) => c.name).join(', ')}\nSubject: ${ticket.subject}\nDescription: ${(ticket.description || '').slice(0, 2000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || '').join('').replace(/```json|```/g, '').trim();
    const out = JSON.parse(text);
    if (!PRIORITIES.includes(out.priority)) delete out.priority;
    return out;
  } catch {
    return null; // AI is best-effort; routing continues without it
  }
}
