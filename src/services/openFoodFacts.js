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
    page: String(page),
    page_size: String(pageSize),
    json: '1',
    fields: 'code,product_name,product_name_en,generic_name,brands,quantity,categories_tags,allergens_tags,ingredients_text,countries_tags,packaging,nutrition_grades_tags,nutriments,serving_size,stores',
  })
  const url = `${OF_BASE}/api/v2/search?${params.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data
}

export default { lookupByBarcode, searchProducts }
