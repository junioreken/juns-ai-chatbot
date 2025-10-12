const axios = require('axios');

/**
 * Track a package by tracking number using a provider (AfterShip if API key provided),
 * otherwise return a universal tracking link fallback.
 * @param {string} trackingNumber
 * @returns {Promise<{status:string, courier?:string, last_update?:string, checkpoint?:string, link:string}>}
 */
async function trackByNumber(trackingNumber, preferredSlug = '') {
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
      let slug = preferredSlug || '';
      try {
        if (!slug) {
          const { data: det } = await axios.post('https://api.aftership.com/v4/couriers/detect', {
            tracking: { tracking_number: number }
          }, { headers });
          slug = det && det.data && det.data.couriers && det.data.couriers[0] && det.data.couriers[0].slug ? det.data.couriers[0].slug : '';
        }
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
        // Derive a robust status across tag/subtag/checkpoints
        const checkpoints = Array.isArray(t.checkpoints) ? t.checkpoints : [];
        const last = checkpoints.slice(-1)[0] || null;
        const rawTag = (t.tag || t.subtag || '').toLowerCase();
        const lastSubtag = (last && (last.subtag || last.tag)) ? String(last.subtag || last.tag).toLowerCase() : '';
        const messages = [t?.message, last?.message, ...checkpoints.map(c => c.message)].filter(Boolean).map(x => String(x).toLowerCase());

        const isDelivered = rawTag.includes('delivered') || lastSubtag.includes('delivered') || messages.some(m => /delivered|delivery successful|signed|proof of delivery|pod/.test(m));
        const isOutForDelivery = rawTag.includes('outfordelivery') || lastSubtag.includes('outfordelivery') || messages.some(m => /out for delivery/.test(m));
        const isInTransit = rawTag.includes('intransit') || lastSubtag.includes('intransit') || messages.some(m => /in transit|line haul|departed|arrived at facility/.test(m));
        const isException = rawTag.includes('exception') || lastSubtag.includes('exception') || messages.some(m => /exception|failed|unable to deliver|return to sender/.test(m));
        const isInfoReceived = rawTag.includes('info') || rawTag.includes('pending') || messages.some(m => /label created|shipment information received|pending/.test(m));

        let status = 'Unknown';
        if (isDelivered) status = 'Delivered';
        else if (isOutForDelivery) status = 'Out for delivery';
        else if (isInTransit) status = 'In transit';
        else if (isException) status = 'Delivery exception';
        else if (isInfoReceived) status = 'Label created';
        else status = (t.tag || t.subtag || 'Unknown');

        const courier = t.slug || t.courier || ((last && last.courier) || '');
        const checkpoint = last ? `${last.location || ''} ${last.message || ''}`.trim() : '';
        const last_update = (last && (last.checkpoint_time || last.time)) || t.updated_at || '';

        return { status, courier, last_update, checkpoint, link: universalLink };
      }
    } catch (e) {
      // fall back
      return { status: 'Awaiting carrier update', link: universalLink };
    }
  }

  // Fallback only link
  return { status: 'Awaiting carrier update', link: universalLink };
}

module.exports = { trackByNumber };


