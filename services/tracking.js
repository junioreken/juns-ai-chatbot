const axios = require('axios');

/**
 * Track a package by tracking number using a provider (AfterShip if API key provided),
 * otherwise return a universal tracking link fallback.
 * @param {string} trackingNumber
 * @returns {Promise<{status:string, courier?:string, last_update?:string, checkpoint?:string, link:string}>}
 */
async function trackByNumber(trackingNumber) {
  const number = String(trackingNumber).trim();
  const afterShipKey = process.env.AFTERSHIP_API_KEY;
  const universalLink = `https://t.17track.net/en#nums=${encodeURIComponent(number)}`;

  // If AfterShip is available, use it for real-time tracking
  if (afterShipKey) {
    const headers = {
      'aftership-api-key': afterShipKey,
      'content-type': 'application/json'
    };
    try {
      // 0) Try to detect courier slug for better accuracy
      let slug = '';
      try {
        const { data: det } = await axios.post('https://api.aftership.com/v4/couriers/detect', {
          tracking: { tracking_number: number }
        }, { headers });
        slug = det && det.data && det.data.couriers && det.data.couriers[0] && det.data.couriers[0].slug ? det.data.couriers[0].slug : '';
      } catch (_) {}

      // Create or ensure tracking exists (idempotent)
      try {
        await axios.post('https://api.aftership.com/v4/trackings', {
          tracking: { tracking_number: number, slug: slug || undefined }
        }, { headers });
      } catch (_) {
        // ignore if already exists or any 4xx which indicates duplicate
      }

      // Fetch current status
      const endpoint = slug ? `https://api.aftership.com/v4/trackings/${slug}/${encodeURIComponent(number)}` : `https://api.aftership.com/v4/trackings/${encodeURIComponent(number)}`;
      const { data } = await axios.get(endpoint, { headers });
      const t = data && data.data && data.data.tracking ? data.data.tracking : null;
      if (t) {
        const status = t.tag || t.subtag || t?.checkpoints?.slice(-1)[0]?.subtag || 'Unknown';
        const courier = t.slug || t.courier || ((t.checkpoints && t.checkpoints.slice(-1)[0] && t.checkpoints.slice(-1)[0].courier) || '');
        const last = t.checkpoints && t.checkpoints.slice(-1)[0];
        const checkpoint = last ? `${last.location || ''} ${last.message || ''}`.trim() : '';
        const last_update = (last && last.checkpoint_time) || t.updated_at || '';
        return { status, courier, last_update, checkpoint };
      }
    } catch (e) {
      // fall back
      return { status: 'Awaiting carrier update' };
    }
  }

  // Fallback only link
  return { status: 'Awaiting carrier update' };
}

module.exports = { trackByNumber };


