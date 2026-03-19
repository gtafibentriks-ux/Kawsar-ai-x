// api/imagine.js — Vercel Serverless Function (CommonJS)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      prompt  = 'beautiful landscape',
      style   = 'realistic',
      width   = 1024,
      height  = 1024,
    } = req.body || {};

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // --- Step 1: Optionally enhance prompt with Claude ---
    let enhancedPrompt = prompt.trim();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        const styleDesc = {
          realistic:  'photorealistic, 8K, ultra detailed, professional photography',
          anime:      'anime illustration style, vibrant colors, Studio Ghibli quality',
          digital:    'digital concept art, artstation trending, vibrant, detailed',
          oil:        'oil painting, classical art, rich textures, masterpiece',
          sketch:     'detailed pencil sketch, fine line art, professional illustration',
          watercolor: 'watercolor painting, soft colors, artistic, flowing brushstrokes',
        }[style] || 'photorealistic, detailed';

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 150,
            system: 'You are an expert image prompt engineer. Rewrite the user prompt as a vivid, detailed image generation prompt. Add lighting, composition, and quality details. Keep under 120 words. Return ONLY the prompt text, no explanations, no quotes.',
            messages: [{ role: 'user', content: `Enhance for ${styleDesc}: "${prompt}"` }],
          }),
        });

        if (claudeRes.ok) {
          const cData = await claudeRes.json();
          const txt = cData.content?.[0]?.text?.trim();
          if (txt) enhancedPrompt = txt;
        }
      } catch (_) {
        // Enhancement failed — use original prompt, continue
      }
    }

    // --- Step 2: Generate image via Pollinations.ai (free, no key) ---
    const styleTag = {
      realistic:  'photorealistic, 8k ultra detailed',
      anime:      'anime style, vibrant illustration',
      digital:    'digital art, concept art, artstation',
      oil:        'oil painting, classical art style',
      sketch:     'pencil sketch, detailed line art',
      watercolor: 'watercolor painting, soft artistic colors',
    }[style] || 'photorealistic';

    const fullPrompt    = `${enhancedPrompt}, ${styleTag}`;
    const encodedPrompt = encodeURIComponent(fullPrompt);
    const seed          = Math.floor(Math.random() * 999999);
    const safeW         = Math.min(Math.max(parseInt(width)  || 1024, 256), 1440);
    const safeH         = Math.min(Math.max(parseInt(height) || 1024, 256), 1440);

    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${safeW}&height=${safeH}&seed=${seed}&nologo=true&model=flux`;

    // Fetch with timeout
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 25000);

    let imgRes;
    try {
      imgRes = await fetch(imageUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!imgRes.ok) {
      return res.status(502).json({ error: `Image service returned ${imgRes.status}. Try again.` });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(502).json({ error: 'Image service returned non-image data. Try again.' });
    }

    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return res.status(200).json({
      success:        true,
      image:          `data:${contentType};base64,${base64}`,
      prompt:         fullPrompt,
      enhancedPrompt: enhancedPrompt,
      seed:           seed,
    });

  } catch (err) {
    console.error('Imagine handler error:', err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Image generation timed out. Please try again.' });
    }
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown') });
  }
};
