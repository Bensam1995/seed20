// Vercel Serverless: GET /api/scan
// Proxies Polymarket Gamma API to avoid CORS issues

module.exports = async function handler(req, res) {
  const { limit = '20', order = 'volume_24hr', tag_id } = req.query;

  let url = `https://gamma-api.polymarket.com/events?active=true&closed=false&order=${order}&ascending=false&limit=${limit}`;
  if (tag_id) url += `&tag_id=${tag_id}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Polymarket API error' });
    }

    const data = await response.json();

    // Filter out events with no active open markets
    const filtered = data.filter(event => {
      return event.markets?.some(m => m.active && !m.closed);
    });

    return res.status(200).json(filtered);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
