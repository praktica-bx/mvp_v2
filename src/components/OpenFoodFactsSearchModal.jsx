import React, { useState } from 'react'
import './OpenFoodFactsSearchModal.css'
import { searchProducts } from '../services/openFoodFacts'

export default function OpenFoodFactsSearchModal({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const doSearch = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await searchProducts(query)
      setResults(res.products || [])
    } catch (err) {
      console.error('Search error', err)
      setError(err.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="off-modal-overlay" onClick={onClose}>
      <div className="off-modal" onClick={(e) => e.stopPropagation()}>
        <div className="off-header">
          <h3>Search OpenFoodFacts</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product name" />
          <button className="btn btn-primary" onClick={doSearch} disabled={!query || loading}>{loading ? 'Searching…' : 'Search'}</button>
        </div>

        {error && <div className="off-error">{error}</div>}

        <div className="off-results">
          {results.map((p) => (
            <div key={p.id || p.code} className="off-result-item">
              <div style={{ flex: 1 }}>
                <strong>{p.product_name || p.product_name_en || p.generic_name || 'Unnamed'}</strong>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{p.brands || ''} — {p.quantity || ''}</div>
              </div>
              <div>
                <button className="btn btn-secondary" onClick={() => onSelect(p)}>Use</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
