export const whatsappLink = (number) => {
  const digits = String(number ?? '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}` : null;
};

// Payment data always comes from the lot row, never from literals.
export const buildPayment = (lot) => ({
  nequiNumber: lot.nequi_number,
  holder: lot.nequi_holder,
  ...(lot.nequi_qr_url ? { qrUrl: lot.nequi_qr_url } : {}),
  whatsapp: whatsappLink(lot.nequi_number),
});
