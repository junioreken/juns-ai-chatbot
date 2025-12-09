/**
 * Canonical knowledge entries used for semantic matching.
 * Each item keeps its tags/keywords for filtering while the semantic layer
 * handles the heavy lifting for similarity scoring.
 */
module.exports = [
  {
    id: 'shipping_times',
    question: {
      en: 'How long does JUN’S take to ship and deliver orders?',
      fr: 'Quels sont les délais d’expédition et de livraison pour JUN’S ?'
    },
    answer: {
      en: 'Orders leave our atelier within 1–2 business days. Standard delivery across Canada and the US typically arrives within 3–5 business days, while international parcels can take 7–10 business days depending on customs. You will receive a tracking link as soon as the parcel leaves our studio.',
      fr: 'Les commandes quittent notre atelier en 1 à 2 jours ouvrables. La livraison standard au Canada et aux États-Unis prend généralement 3 à 5 jours ouvrables, tandis que les envois internationaux nécessitent 7 à 10 jours selon la douane. Un lien de suivi est envoyé dès que le colis quitte notre studio.'
    },
    tags: ['shipping', 'delivery', 'timeline', 'eta', 'orders'],
    keywords: ['shipping', 'delivery', 'time', 'timeline', 'arrive', 'order status'],
    embedding: null
  },
  {
    id: 'shipping_costs',
    question: {
      en: 'How much does shipping cost or is it free?',
      fr: 'Quel est le coût de la livraison ou est-elle gratuite ?'
    },
    answer: {
      en: 'We offer complimentary shipping on orders over $150 before taxes. Orders below that threshold ship for a flat $12 rate within North America. Express and international options are available at checkout if you need a rush delivery.',
      fr: 'Nous offrons la livraison gratuite pour les commandes de plus de 150 $ avant taxes. Les commandes en dessous de ce montant sont expédiées avec des frais fixes de 12 $ en Amérique du Nord. Des options express et internationales sont proposées au moment du paiement si vous avez besoin d’un envoi urgent.'
    },
    tags: ['shipping', 'delivery', 'cost', 'price', 'free'],
    keywords: ['shipping price', 'delivery cost', 'free shipping', 'fees'],
    embedding: null
  },
  {
    id: 'returns_policy',
    question: {
      en: 'What is the return or exchange policy?',
      fr: 'Quelle est la politique de retour ou d’échange ?'
    },
    answer: {
      en: 'You have 30 days from the delivery date to request a return or size exchange. Items must be unworn, unwashed, and with original tags attached. Start the process by emailing support@junsdress.com with your order number and the item you’d like to return.',
      fr: 'Vous disposez de 30 jours après la livraison pour demander un retour ou un échange de taille. Les articles doivent être non portés, non lavés et munis de leurs étiquettes d’origine. Pour lancer la procédure, écrivez à support@junsdress.com en indiquant votre numéro de commande et l’article concerné.'
    },
    tags: ['returns', 'refund', 'exchange', 'policy'],
    keywords: ['return', 'exchange', 'refund', 'policy', 'swap'],
    embedding: null
  },
  {
    id: 'size_support',
    question: {
      en: 'How do I pick the right size or use the size guide?',
      fr: 'Comment choisir la bonne taille ou utiliser le guide des tailles ?'
    },
    answer: {
      en: 'Measure your bust, waist, and hips and compare them with the size chart listed on each product page. If you are between sizes, size up for a relaxed fit or email us with your measurements so our stylists can recommend the best option.',
      fr: 'Mesurez votre buste, votre taille et vos hanches puis comparez-les au guide des tailles présent sur chaque fiche produit. Si vous êtes entre deux tailles, prenez la taille au-dessus pour une coupe plus confortable ou écrivez-nous avec vos mensurations afin que nos stylistes puissent vous conseiller.'
    },
    tags: ['size', 'fit', 'measurement', 'guide'],
    keywords: ['size chart', 'measurement', 'fit', 'guide'],
    embedding: null
  },
  {
    id: 'order_tracking',
    question: {
      en: 'How can I track my order once it ships?',
      fr: 'Comment suivre ma commande après l’expédition ?'
    },
    answer: {
      en: 'A tracking link is emailed as soon as your parcel ships. You can also paste your order number and email into our tracking page or contact support if the link is missing. Tracking updates can take 12–24 hours to appear once the carrier scans the parcel.',
      fr: 'Un lien de suivi est envoyé par courriel dès que votre colis est expédié. Vous pouvez également saisir votre numéro de commande et votre courriel sur notre page de suivi ou contacter le service client si le lien est manquant. Les mises à jour peuvent prendre 12 à 24 heures après le premier scan du transporteur.'
    },
    tags: ['order', 'tracking', 'shipping', 'status'],
    keywords: ['tracking', 'order status', 'where is my order'],
    embedding: null
  },
  {
    id: 'contact_support',
    question: {
      en: 'How do I contact JUN’S support or speak to a stylist?',
      fr: 'Comment contacter le service client de JUN’S ou parler à une styliste ?'
    },
    answer: {
      en: 'You can reply to any of our emails or write directly to support@junsdress.com. Our stylists answer Monday to Friday, 9am–6pm EST, and usually reply within one business day. During live events we also monitor Instagram DMs @junsdress for urgent styling questions.',
      fr: 'Vous pouvez répondre à n’importe quel courriel que nous envoyons ou écrire directement à support@junsdress.com. Nos stylistes répondent du lundi au vendredi, de 9 h à 18 h (EST), généralement sous un jour ouvrable. Lors des événements en direct, nous surveillons également les messages Instagram @junsdress pour les questions urgentes de style.'
    },
    tags: ['contact', 'support', 'help', 'stylist'],
    keywords: ['contact', 'support', 'help', 'stylist', 'customer service'],
    embedding: null
  }
];
