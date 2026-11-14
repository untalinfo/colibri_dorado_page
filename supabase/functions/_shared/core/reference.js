// Unambiguous alphabet: no 0, 1, O, I, L.
export const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const defaultRandom = () => crypto.getRandomValues(new Uint8Array(6));

export function generateReference(random = defaultRandom) {
  const bytes = random();
  let out = 'CD-';
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return out;
}
