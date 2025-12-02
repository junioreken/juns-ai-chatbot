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
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;

  async function fallbackViaShopify() {
    try {
      if (!shopifyDomain || !shopifyToken) return null;
      const fields = 'id,name,order_number,updated_at,fulfillments';
      const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?status=any&limit=100&fields=${encodeURIComponent(fields)}`;
      const { data } = await axios.get(url, { headers: { 'X-Shopify-Access-Token': shopifyToken }});
      const orders = Array.isArray(data?.orders) ? data.orders : [];
      const match = orders.find(o => (o.fulfillments || []).some(ff => (ff.tracking_number && String(ff.tracking_number).includes(number)) || (Array.isArray(ff.tracking_numbers) && ff.tracking_numbers.some(x => x && String(x).includes(number)))));
      if (!match) return null;

      // Pick the fulfillment that matches the tracking number
      const fulfillment = (match.fulfillments || []).find(ff => (ff.tracking_number && String(ff.tracking_number).includes(number)) || (Array.isArray(ff.tracking_numbers) && ff.tracking_numbers.some(x => x && String(x).includes(number)))) || (match.fulfillments || [])[0];
      const shipmentStatus = (fulfillment && fulfillment.shipment_status) || '';
      const statusMap = {
        delivered: 'Delivered',
        out_for_delivery: 'Out for delivery',
        in_transit: 'In transit',
        attempted_delivery: 'Delivery attempt',
        ready_for_pickup: 'Ready for pickup',
        confirmed: 'Confirmed',
        failure: 'Delivery exception',
        label_printed: 'Label created',
        label_purchased: 'Label purchased'
      };
      const status = statusMap[shipmentStatus] || (shipmentStatus ? shipmentStatus : 'Unknown');
      const courier = (fulfillment && (fulfillment.tracking_company || '')) || '';
      const last_update = fulfillment?.updated_at || match.updated_at || '';
      const link = (Array.isArray(fulfillment?.tracking_urls) && fulfillment.tracking_urls[0]) || fulfillment?.tracking_url || universalLink;
      return { status, courier, last_update, checkpoint: '', link };
    } catch (error) {
      console.warn('[tracking] Shopify fallback failed:', error?.message || error);
      return null;
    }
  }

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
      } catch (error) {
        console.warn('[tracking] AfterShip courier detection failed:', error?.message || error);
      }

      // Create or ensure tracking exists (idempotent)
      try {
        await axios.post('https://api.aftership.com/v4/trackings', {
          tracking: { tracking_number: number, slug: slug || undefined }
        }, { headers });
      } catch (error) {
        console.warn('[tracking] AfterShip tracking create failed:', error?.message || error);
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
      const fb = await fallbackViaShopify();
      if (fb) return fb;
      return { status: 'Awaiting carrier update', link: universalLink };
    }
  }

  // Fallback only link
  const fb = await fallbackViaShopify();
  if (fb) return fb;
  return { status: 'Awaiting carrier update', link: universalLink };
}

module.exports = { trackByNumber };


