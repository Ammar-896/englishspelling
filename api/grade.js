export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, correctDef, userAnswer } = req.body;

  if (!userAnswer || userAnswer.trim().length === 0) {
    return res.json({
      correct: false,
      partial: false,
      feedback: "You didn't write anything — don't leave it blank!",
      score: 0
    });
  }

  const prompt = `You are grading a PRIMARY SCHOOL student's definition on a spelling test. The teacher is VERY lenient and kind.

Word: "${word}"
Official definition: "${correctDef}"
Student's answer: "${userAnswer}"

Grading rules (BE GENEROUS):
- Mark as CORRECT (score: 1) if they captured the main idea, even with different words, minor spelling mistakes, or casual phrasing
- Mark as PARTIAL (score: 0.5) if they got part of the idea or were vaguely on the right track
- Mark as INCORRECT (score: 0) ONLY if completely wrong or totally irrelevant
- A simple but accurate answer is PERFECT — don't penalise brevity
- Ignore capitalisation and punctuation
- Accept synonyms and reasonable paraphrases freely

Respond with ONLY a raw JSON object (no markdown, no explanation, no backticks):
{"correct":true/false,"partial":true/false,"feedback":"one short encouraging sentence (max 10 words)","score":0 or 0.5 or 1}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.2
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq error:', err);
      return res.status(500).json({ error: 'Groq API error', details: err });
    }

    const data = await groqRes.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json|```/gi, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      // Fallback: try to extract JSON from the text
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse JSON: ' + clean);
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}