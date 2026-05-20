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

  const prompt = `You are grading a PRIMARY SCHOOL student's definition on a spelling test.

Word: "${word}"
Official definition: "${correctDef}"
Student's answer: "${userAnswer}"

GRADING RULES — read carefully:

CORRECT (score: 1) — award this if the student clearly understood the meaning:
  - They captured the main idea, even with casual or simple phrasing
  - They used different words but the meaning is clearly right
  - Minor spelling mistakes are fine
  - Short but accurate answers are perfect

PARTIAL (score: 0.5) — award this if:
  - They got part of the idea but missed something important
  - Their answer is vague but shows they have some understanding

INCORRECT (score: 0) — award this if:
  - The answer has NO connection to the actual meaning of the word
  - It is a random word, a test input, gibberish, or completely off-topic
  - The student clearly guessed with no understanding (e.g. answering "test", "idk", "hello", "123", or a single unrelated word)
  - The answer is about a completely different concept

IMPORTANT: Being "lenient" means accepting imperfect but genuine attempts — it does NOT mean accepting random words or nonsense. A single word that is not related to the definition must score 0.

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