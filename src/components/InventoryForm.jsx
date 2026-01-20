import { useState, useEffect } from 'react'
import AllergenCheckboxes from './AllergenCheckboxes'
import { addInventoryItem, getFieldPreferences, trackChange } from '../database'
import { SUPPLY_CATEGORIES } from '../constants/categories'

export default function InventoryForm({ onSave, onCancel, onOpenScanner, scannedBarcode, isOnline = true, householdId, householdName }) {
  const [preferences, setPreferences] = useState(null)
  const [formData, setFormData] = useState({
    barcode: scannedBarcode || '',
    productName: '',
    quantity: 1,
    unit: 'pcs',
    expiryDate: '',
    category: 'water',
    allergens: [],
    storageLocation: '',
    cost: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    preferredConsumptionDate: '',
    supplier: '',
    storageNotes: '',
    itemStatus: 'unopened',
    lotNumber: '',
    nutritionInfo: '',
    dietaryRestrictions: [],
    priorityLevel: 'important',
    packaging: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load field preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      const prefs = await getFieldPreferences()
      setPreferences(prefs)
    }
    loadPreferences()
  }, [])

  // Update barcode when scanned barcode changes
  useEffect(() => {
    if (scannedBarcode) {
      setFormData((prev) => ({ ...prev, barcode: scannedBarcode }))
    }
  }, [scannedBarcode])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleAllergenChange = (allergens) => {
    setFormData((prev) => ({ ...prev, allergens }))
  }

  const handleDietaryChange = (dietary) => {
    setFormData((prev) => ({ ...prev, dietaryRestrictions: dietary }))
  }

  // Validate form based on mandatory fields from preferences
  const validateForm = () => {
    if (!preferences) return true

    for (const [field, config] of Object.entries(preferences)) {
      if (config.mandatory) {
        const value = formData[field]
        if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) {
          throw new Error(`${config.label} is required`)
        }
      }
    }

    // Food category allergens check
    if (formData.category === 'food' && formData.allergens.length === 0 && preferences.allergens?.mandatory) {
      throw new Error('Please select at least one allergen for food items')
    }

    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      validateForm()

      // Only include fields that are visible (optional: only include visible ones to save space)
      const itemToSave = {
        addedDate: new Date().toISOString(),
      }

      // Add all fields that exist in preferences
      Object.keys(preferences || {}).forEach((field) => {
        if (field in formData) {
          let value = formData[field]
          // Handle arrays
          if (Array.isArray(value)) {
            value = value.join(',')
          }
          itemToSave[field] = value || null
        }
      })

      const itemId = await addInventoryItem(itemToSave, householdId)

      // If offline, track this for sync
      if (!isOnline) {
        await trackChange('inventory', itemId, 'create')
        setError('') // Clear any previous errors
      }

      // Reset form
      setFormData({
        barcode: '',
        productName: '',
        quantity: 1,
        unit: 'pcs',
        expiryDate: '',
        category: 'water',
        allergens: [],
        storageLocation: '',
        cost: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        preferredConsumptionDate: '',
        supplier: '',
        storageNotes: '',
        itemStatus: 'unopened',
        lotNumber: '',
        nutritionInfo: '',
        dietaryRestrictions: [],
        priorityLevel: 'important',
        packaging: '',
      })
      onSave()
    } catch (err) {
      setError(err.message || 'Error saving item')
    } finally {
      setLoading(false)
    }
  }

  if (!preferences) {
    return <div className="loading">Loading form...</div>
  }

  // Helper to render field conditionally
  const renderField = (fieldName) => {
    const config = preferences[fieldName]
    if (!config || !config.visible) return null

    const label = `${config.label}${config.mandatory ? ' *' : ''}`
    const value = formData[fieldName]

    switch (fieldName) {
      case 'barcode':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type="text"
              name={fieldName}
              value={value}
              onChange={handleChange}
              onClick={onOpenScanner}
              placeholder="Click to scan or enter barcode"
              required={config.mandatory}
            />
          </div>
        )

      case 'productName':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type="text"
              name={fieldName}
              value={value}
              onChange={handleChange}
              placeholder="e.g., Canned beans"
              required={config.mandatory}
            />
          </div>
        )

      case 'quantity':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type="number"
              name={fieldName}
              value={value}
              onChange={handleChange}
              min="1"
              required={config.mandatory}
            />
          </div>
        )

      case 'unit':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              <option value="pcs">pcs</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="l">l</option>
              <option value="ml">ml</option>
            </select>
          </div>
        )

      case 'category':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              {SUPPLY_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        )

      case 'expiryDate':
      case 'purchaseDate':
      case 'preferredConsumptionDate':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type="date"
              name={fieldName}
              value={value}
              onChange={handleChange}
              required={config.mandatory}
            />
          </div>
        )

      case 'cost':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type="number"
              step="0.01"
              name={fieldName}
              value={value}
              onChange={handleChange}
              placeholder="e.g., 25.99"
              required={config.mandatory}
            />
          </div>
        )

      case 'allergens':
        return formData.category === 'food' ? (
          <div key={fieldName}>
            <AllergenCheckboxes value={value} onChange={handleAllergenChange} />
          </div>
        ) : null

      case 'itemStatus':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              <option value="unopened">Unopened</option>
              <option value="opened">Opened</option>
              <option value="partially-used">Partially Used</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        )

      case 'priorityLevel':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              <option value="essential">Essential</option>
              <option value="important">Important</option>
              <option value="nice-to-have">Nice to Have</option>
            </select>
          </div>
        )

      case 'storageLocation':
      case 'supplier':
      case 'lotNumber':
      case 'nutritionInfo':
      case 'packaging':
      case 'storageNotes':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type={fieldName === 'storageNotes' ? 'textarea' : 'text'}
              name={fieldName}
              value={value}
              onChange={handleChange}
              placeholder={`Enter ${config.label.toLowerCase()}`}
              required={config.mandatory}
            />
          </div>
        )

      case 'dietaryRestrictions':
        return (
          <div key={fieldName} className="form-group">
            <label>{label}</label>
            <div className="checkbox-group">
              {['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher'].map((option) => (
                <label key={option} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    name={option}
                    checked={formData.dietaryRestrictions.includes(option)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleDietaryChange([...formData.dietaryRestrictions, option])
                      } else {
                        handleDietaryChange(formData.dietaryRestrictions.filter((v) => v !== option))
                      }
                    }}
                  />
                  <span style={{ marginLeft: '8px' }}>{option.charAt(0).toUpperCase() + option.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const visibleFields = Object.keys(preferences).filter((key) => preferences[key]?.visible)

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal u-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            Add Item to Inventory{householdName ? ` — ${householdName}` : ''}
          </h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="inventory-form">
          {/* Render visible fields */}
          {visibleFields.includes('barcode') && visibleFields.includes('productName') && (
            <>
              {renderField('barcode')}
              {renderField('productName')}
            </>
          )}

          {/* Quantity and Unit in a row */}
          {(visibleFields.includes('quantity') || visibleFields.includes('unit')) && (
            <div className="form-row">
              {renderField('quantity')}
              {renderField('unit')}
            </div>
          )}

          {/* Core fields */}
          {renderField('expiryDate')}
          {renderField('category')}
          {renderField('allergens')}

          {/* Additional fields */}
          {renderField('storageLocation')}
          {renderField('purchaseDate')}
          {renderField('preferredConsumptionDate')}
          {renderField('cost')}
          {renderField('supplier')}
          {renderField('storageNotes')}
          {renderField('itemStatus')}
          {renderField('lotNumber')}
          {renderField('nutritionInfo')}
          {renderField('dietaryRestrictions')}
          {renderField('priorityLevel')}
          {renderField('packaging')}

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
