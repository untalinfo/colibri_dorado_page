// Public business contact, published on purpose (footer, JSON-LD, llms.txt).
// Plain ESM with no JSX so the build-time SEO plugin can import it too.
export const WHATSAPP_NUMBER = '573108233269';
export const WHATSAPP_DISPLAY = '+57 310 823 3269';
export const WHATSAPP_GREETING = 'Hola, quiero información sobre la miel Colibrí Dorado.';

export const whatsappUrl = (text = WHATSAPP_GREETING) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
