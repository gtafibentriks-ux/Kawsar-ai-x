// api/chat.js — Vercel Serverless Function (CommonJS)

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Go to Vercel Dashboard → Settings → Environment Variables and add it.'
    });
  }

  try {
    const { messages, system, model, max_tokens, tools } = req.body;

    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: max_tokens || 1000,
      system: system || 'You are KAWSAR-AI, a helpful assistant.',
      messages: messages || [],
    };
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || `Anthropic API returned ${response.status}`
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown error') });
  }
};