// The only things the memory system needs from this module of the full app.
export const stripStickers = text => text.replace(/\[(?:表情|图片)[:：][^\]\n]*\]/g, '').replace(/!\[[^\]\n]*\]\([^)\s]*\)/g, '').trim();
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
