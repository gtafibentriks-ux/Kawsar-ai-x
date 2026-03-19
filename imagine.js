// api/imagine.js — Vercel Serverless Function
// Generates images using Pollinations.ai (free, no key needed)
// and enhances prompts using Claude

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const { prompt, mode = 'generate', width = 1024, height = 1024, style = 'realistic' } = req.body;

    // Step 1: Enhance prompt with Claude (if API key available)
    let enhancedPrompt = prompt;
    if (apiKey) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            system: 'You are an expert image prompt engineer. Given a user prompt, rewrite it as a detailed, vivid image generation prompt. Add style, lighting, composition details. Keep it under 200 words. Return ONLY the enhanced prompt, nothing else.',
            messages: [{ role: 'user', content: `Enhance this image prompt for ${style} style: "${prompt}"` }],
          }),
        });
        const claudeData = await claudeRes.json();
        if (claudeData.content?.[0]?.text) {
          enhancedPrompt = claudeData.content[0].text.trim();
        }
      } catch (e) {
        // Use original prompt if Claude enhancement fails
        enhancedPrompt = prompt;
      }
    }

    // Step 2: Generate image via Pollinations.ai (completely free, no API key)
    const styleMap = {
      realistic: 'photorealistic, 8k, detailed',
      anime:     'anime style, vibrant, detailed illustration',
      digital:   'digital art, concept art, artstation',
      oil:       'oil painting, classical art style',
      sketch:    'pencil sketch, detailed line art',
      watercolor:'watercolor painting, soft colors',
    };
    const styleTag = styleMap[style] || styleMap.realistic;
    const fullPrompt = `${enhancedPrompt}, ${styleTag}`;
    const encodedPrompt = encodeURIComponent(fullPrompt);

    const seed = Math.floor(Math.random() * 999999);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

    // Fetch image and return as base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('Image generation failed');

    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    return res.status(200).json({
      success: true,
      image: `data:${mimeType};base64,${base64}`,
      prompt: fullPrompt,
      enhancedPrompt,
      seed,
    });

  } catch (err) {
    console.error('Image generation error:', err);
    return res.status(500).json({ error: 'Image generation failed: ' + err.message });
  }
}
