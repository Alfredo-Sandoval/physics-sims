// Repeatable decorative geometry, independent of playback and reload order.
export function seedFromName(name) {
  let hash = 2166136261;
  for (const letter of name) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function createRandom(name) {
  let seed = seedFromName(name);
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  random.range = (min, max) => min + (max - min) * random();
  return random;
}
