import { useState, useEffect, useCallback } from 'react'
import { getInventory, deleteInventoryItem } from '../database'
import { getCategoryLabel, SUPPLY_CATEGORIES } from '../constants/categories'
import './InventoryList.css'

const SORT_OPTIONS = [
  { value: 'expiry', label: 'Expiry Date' },
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'added', label: 'Date Added' },
]

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return 'none'
  const now = new Date()
  const expiry = new Date(expiryDate)
  const daysLeft = Math.floor((expiry - now) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 30) return 'soon'
  return 'ok'
}

function formatExpiry(expiryDate) {
  if (!expiryDate) return '—'
  const expiry = new Date(expiryDate)
  const now = new Date()
  const daysLeft = Math.floor((expiry - now) / (1000 * 60 * 60 * 24))
  const formatted = expiry.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  if (daysLeft < 0) return `${formatted} (expired)`
  if (daysLeft === 0) return `${formatted} (today)`
  if (daysLeft <= 30) return `${formatted} (${daysLeft}d)`
  return formatted
}

export default function InventoryList({ householdId, refreshKey, onEdit, onDeleted }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortBy, setSortBy] = useState('expiry')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadItems = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    try {
      const data = await getInventory(householdId)
      setItems(data)
    } catch (err) {
      console.error('Failed to load inventory:', err)
    } finally {
      setLoading(false)
    }
  }, [householdId])

  useEffect(() => {
    loadItems()
  }, [loadItems, refreshKey])

  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      await deleteInventoryItem(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      setConfirmDeleteId(null)
      onDeleted?.()
    } catch (err) {
      console.error('Failed to delete item:', err)
    } finally {
      setDeletingId(null)
    }
  }

  // Filter and sort
  const filtered = items
    .filter((item) => {
      const name = (item.productName || item.name || '').toLowerCase()
      const brand = (item.brand || '').toLowerCase()
      const query = searchQuery.toLowerCase()
      if (query && !name.includes(query) && !brand.includes(query)) return false
      if (categoryFilter && item.category !== categoryFilter) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'expiry') {
        if (!a.expiryDate) return 1
        if (!b.expiryDate) return -1
        return new Date(a.expiryDate) - new Date(b.expiryDate)
      }
      if (sortBy === 'name') {
        return (a.productName || a.name || '').localeCompare(b.productName || b.name || '')
      }
      if (sortBy === 'category') {
        return (a.category || '').localeCompare(b.category || '')
      }
      if (sortBy === 'added') {
        return new Date(b.purchaseDate || 0) - new Date(a.purchaseDate || 0)
      }
      return 0
    })

  if (loading) {
    return (
      <div className="inventory-list">
        <div className="inventory-list__loading">Loading inventory…</div>
      </div>
    )
  }

  return (
    <section className="inventory-list">
      <div className="inventory-list__header">
        <h2 className="inventory-list__title">
          Inventory
          {items.length > 0 && <span className="inventory-list__count">{items.length}</span>}
        </h2>
      </div>

      {items.length > 0 && (
        <div className="inventory-list__controls">
          <input
            className="inventory-list__search"
            type="search"
            placeholder="Search items…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="inventory-list__controls-row">
            <select
              className="inventory-list__filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {SUPPLY_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select
              className="inventory-list__sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="inventory-list__empty">
          {items.length === 0
            ? 'No items yet — add your first supply above.'
            : 'No items match your search.'}
        </div>
      ) : (
        <ul className="inventory-list__items">
          {filtered.map((item) => {
            const expiryStatus = getExpiryStatus(item.expiryDate)
            const isConfirming = confirmDeleteId === item.id
            return (
              <li key={item.id} className={`inventory-item inventory-item--${expiryStatus}`}>
                <div className="inventory-item__main">
                  <div className="inventory-item__info">
                    <span className="inventory-item__name">
                      {item.productName || item.name || 'Unnamed item'}
                    </span>
                    {item.brand && (
                      <span className="inventory-item__brand">{item.brand}</span>
                    )}
                    <div className="inventory-item__meta">
                      <span className="inventory-item__category">
                        {getCategoryLabel(item.category) || item.category}
                      </span>
                      <span className="inventory-item__qty">
                        {item.quantity} {item.unit || 'pcs'}
                      </span>
                      {item.storageLocation && (
                        <span className="inventory-item__location">📍 {item.storageLocation}</span>
                      )}
                    </div>
                  </div>
                  <div className="inventory-item__right">
                    {item.expiryDate && (
                      <span className={`inventory-item__expiry inventory-item__expiry--${expiryStatus}`}>
                        {formatExpiry(item.expiryDate)}
                      </span>
                    )}
                    {!isConfirming && (
                      <div className="inventory-item__actions">
                        <button
                          className="inventory-item__btn inventory-item__btn--edit"
                          onClick={() => onEdit(item.id)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="inventory-item__btn inventory-item__btn--delete"
                          onClick={() => setConfirmDeleteId(item.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                    {isConfirming && (
                      <div className="inventory-item__confirm">
                        <span className="inventory-item__confirm-text">Delete?</span>
                        <button
                          className="inventory-item__btn inventory-item__btn--confirm-yes"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                        >
                          Yes
                        </button>
                        <button
                          className="inventory-item__btn inventory-item__btn--confirm-no"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
