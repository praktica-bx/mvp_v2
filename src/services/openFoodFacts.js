const OF_BASE = 'https://world.openfoodfacts.org'

export const lookupByBarcode = async (barcode) => {
  if (!barcode) throw new Error('barcode required')
  const url = `${OF_BASE}/api/v0/product/${encodeURIComponent(barcode)}.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('OpenFoodFacts lookup failed')
  const data = await res.json()
  if (data.status !== 1) throw new Error('Product not found')
  return data.product
}

export const searchProducts = async (query, page = 1, pageSize = 20) => {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    page: String(page),
    page_size: String(pageSize),
    json: '1',
  })
  const url = `${OF_BASE}/cgi/search.pl?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('OpenFoodFacts search failed')
  const data = await res.json()
  return data
}

export default { lookupByBarcode, searchProducts }
