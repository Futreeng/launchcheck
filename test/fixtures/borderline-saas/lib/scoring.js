// Engagement score 0-100 from a creator's recent posts.
function score(posts) {
  if (!posts.length) return 0;
  const avg = posts.reduce((s, p) => s + p.likes / Math.max(1, p.views), 0) / posts.length;
  return Math.min(100, Math.round(avg * 1000));
}

module.exports = { score };
