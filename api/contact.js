// Vercel serverless function: receives the contact form and forwards it to Discord.
// The webhook URL is read from the DISCORD_WEBHOOK_URL environment variable,
// so it never reaches the browser or the git repository.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trim to Discord's length limits.
function clean(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function buildPayload(data, host) {
  const fields = [
    { name: 'Name', value: clean(data.name, 256), inline: true },
    { name: 'Email', value: clean(data.email, 256), inline: true }
  ];
  if (data.phone) fields.push({ name: 'Number', value: clean(data.phone, 64), inline: true });
  if (data.company) fields.push({ name: 'Company', value: clean(data.company, 256), inline: true });

  return {
    username: 'Portfolio Contact Form',
    allowed_mentions: { parse: [] }, // never ping @everyone/@here or users
    embeds: [{
      title: 'New message from your portfolio',
      description: clean(data.message, 4000),
      color: 0xffbd39,
      fields,
      footer: { text: host || 'portfolio' },
      timestamp: new Date().toISOString()
    }]
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ ok: false, error: 'Contact form is not configured' });
  }

  let data = req.body || {};
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = {}; }
  }

  // Bots fill the hidden field; report success without sending anything.
  if (data._honey) {
    return res.status(200).json({ ok: true });
  }

  const name = clean(data.name, 256);
  const email = clean(data.email, 256);
  const message = clean(data.message, 4000);
  if (!name || !message || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Name, a valid email and a message are required' });
  }

  try {
    const discord = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(data, req.headers.host))
    });
    if (!discord.ok) {
      console.error('Discord webhook responded', discord.status, await discord.text());
      return res.status(502).json({ ok: false, error: 'Could not deliver the message' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Discord webhook request failed', err);
    return res.status(502).json({ ok: false, error: 'Could not deliver the message' });
  }
};
