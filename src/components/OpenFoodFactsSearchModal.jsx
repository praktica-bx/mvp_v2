import React, { useState, useRef, useEffect } from 'react'
import './OpenFoodFactsSearchModal.css'
import { searchProducts } from '../services/openFoodFacts'

export default function OpenFoodFactsSearchModal({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  const modalRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setResults([])
      setError(null)
      return
    }
    // focus the search input when modal opens
    inputRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        // simple focus trap
        const focusable = modalRef.current.querySelectorAll('a[href], area, input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

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
      <div
        className="off-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="off-modal-title"
      >
        <div className="off-header">
          <h3 id="off-modal-title">Search OpenFoodFacts</h3>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query && !loading && doSearch()}
            placeholder="Search product name"
            aria-label="Search product name"
          />
          <button className="btn btn-primary" onClick={doSearch} disabled={!query || loading}>{loading ? 'Searching…' : 'Search'}</button>
        </div>

        {error && <div className="off-error">⚠ {error} — check your internet connection and try again.</div>}

        <div className="off-results">
          {!loading && !error && results.length === 0 && query && (
            <div style={{ padding: '1rem', opacity: 0.6, textAlign: 'center' }}>No results found for "{query}"</div>
          )}
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
