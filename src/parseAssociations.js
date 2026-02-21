// Parses the compact array format returned by the associations API call.
// Each raw category is [[word,s1,s2,s3], …×7] — the keyword is passed in
// separately so Claude never needs to echo it back (preventing it from
// returning the category label "engagement" instead of the user's input).
export function parseCompactAssociations(rawArrays, { engagement, energy, flow }) {
  const parseCompact = (keyword, assocs) => ({
    keyword,
    associations: assocs.map(([word, ...secondary]) => ({ word, secondary }))
  })
  const [engRaw, nrgRaw, flowRaw] = rawArrays
  return {
    engagement: parseCompact(engagement, engRaw),
    energy:     parseCompact(energy,     nrgRaw),
    flow:       parseCompact(flow,        flowRaw),
  }
}
