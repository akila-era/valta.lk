/** Sinhala Unicode block. Used to decide when output must carry `needsNativeReview` and which language path applies. */
const SINHALA = /[඀-෿]/;

export const hasSinhala = (text: string): boolean => SINHALA.test(text);
