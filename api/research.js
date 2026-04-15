// Vercel Serverless: POST /api/research
// Proxies LLM API calls for deep market analysis

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { model, question, description, currentPrice, volume, volume24hr, endDate, tags, context } = req.body;

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  const systemPrompt = `You are an expert prediction market analyst. You have deep knowledge of geopolitics, economics, and institutional dynamics. You also understand Integral Theory / Spiral Dynamics and can apply it as one analytical lens among others.

Analyze the following prediction market and provide:
1. **Summary Assessment**: Is this market overpriced, underpriced, or fairly priced for Yes? State confidence level (Low/Medium/High).
2. **Resolution Criteria**: Parse what exactly needs to happen for Yes/No resolution.
3. **Current Situation**: What's the latest on this event? Key developments.
4. **Integral Analysis** (if applicable for geopolitical/institutional markets): Map key actors to developmental stages (Red/Blue/Orange/Green). Identify stage clashes and potential blind spots in the market consensus.
5. **Standard Analysis**: Base rate, catalysts, time decay, liquidity.
6. **Risk Assessment**: Steelman the opposing view. What could make your assessment wrong?
7. **Recommendation**: Buy Yes / Buy No / Pass, with suggested position size for a $20 bankroll.

Format with clear markdown headers. Be direct and actionable — no filler.`;

  const userPrompt = `Market: "${question}"
Current Yes Price: ${(currentPrice * 100).toFixed(1)}¢
Total Volume: $${Math.round(volume).toLocaleString()}
24hr Volume: $${Math.round(volume24hr).toLocaleString()}
Resolution Date: ${endDate}
Tags: ${(tags || []).join(', ')}

Resolution Description:
${(description || '').slice(0, 1500)}

${context ? `Current Context (from Polymarket):\n${context}` : ''}`;

  try {
    let analysis;

    if (model === 'gemini' && GEMINI_KEY) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
          }),
        }
      );

      const geminiData = await geminiRes.json();

      // Surface actual API errors
      if (geminiData.error) {
        analysis = `Gemini API error: ${geminiData.error.message || JSON.stringify(geminiData.error)}`;
      } else {
        analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
          || `Gemini returned unexpected structure: ${JSON.stringify(geminiData).slice(0, 300)}`;
      }

    } else if (model === 'openai' && OPENAI_KEY) {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      const openaiData = await openaiRes.json();
      analysis = openaiData.choices?.[0]?.message?.content || 'No response from OpenAI';

    } else {
      return res.status(400).json({
        error: `No API key configured for ${model}. Set ${model === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} in Vercel environment variables.`
      });
    }

    return res.status(200).json({ analysis, model, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
