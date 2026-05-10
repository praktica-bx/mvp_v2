import { useState, useEffect } from 'react'
import AllergenCheckboxes from './AllergenCheckboxes'
import OpenFoodFactsSearchModal from './OpenFoodFactsSearchModal'
import { useConflictModal } from '../contexts/ConflictModalContext'
import {
  addInventoryItem,
  getFieldPreferences,
  trackChange,
  getInventoryItem,
  updateInventoryItem,
  updateInventoryItemForce,
  getInventoryById,
  fetchFromCloud,
} from '../database'

const EMPTY_FORM = {
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
  ingredients: '',
  packageSize: '',
  countryOfOrigin: '',
  storageInstructions: '',
  manufacturer: '',
  prescriptionRequired: false,
  dosage: '',
  batteryChemistry: '',
  manufactureDate: '',
  allowGracePeriod: false,
  gracePeriodMonths: 0,
  brand: '',
  batteryCapacity: '',
  lumen: '',
  caloriesPerServing: '',
  servingsPerPackage: '',
  powerRating: '',
  medicationForm: '',
  documentsType: '',
  specialNeedsDetails: '',
  storageTemperature: '',
  containerType: '',
}

export default function InventoryForm({ itemId = null, onSave, onCancel, onOpenScanner, scannedBarcode, isOnline = true, householdId, householdName }) {
  const { openConflictModal } = useConflictModal()

  const [formData, setFormData] = useState(EMPTY_FORM)
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [storageLocations, setStorageLocations] = useState([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [ofModalOpen, setOfModalOpen] = useState(false)

  // Load preferences
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const prefs = await getFieldPreferences(householdId)
        setPreferences(prefs)
      } catch (err) {
        console.warn('Failed to load preferences:', err)
        setPreferences({})
      }
    }
    loadPrefs()
  }, [householdId])

  // Load item data when editing
  useEffect(() => {
    if (!itemId) return
    const loadItem = async () => {
      try {
        const item = await getInventoryItem(itemId)
        if (item) {
          // Format expiryDate as YYYY-MM-DD for input type="date"
          let expiryRaw = item.expiryDate || item.expiry_date || '';
          let expiryDate = '';
          if (expiryRaw) {
            // If expiryRaw is a Date object or ISO string, convert to YYYY-MM-DD
            const d = new Date(expiryRaw);
            if (!isNaN(d)) {
              expiryDate = d.toISOString().split('T')[0];
            } else {
              expiryDate = expiryRaw;
            }
          }
          setFormData({
            ...EMPTY_FORM,
            ...item,
            expiryDate,
            allergens: Array.isArray(item.allergens)
              ? item.allergens
              : item.allergens ? item.allergens.split(',') : [],
            dietaryRestrictions: Array.isArray(item.dietaryRestrictions)
              ? item.dietaryRestrictions
              : item.dietaryRestrictions ? item.dietaryRestrictions.split(',') : [],
            allowGracePeriod: !!item.allowGracePeriod,
            gracePeriodMonths: item.gracePeriodMonths || 0,
          })
        }
      } catch (err) {
        console.warn('Failed to load item for editing:', err)
      }
    }
    loadItem()
  }, [itemId])

  // Watch for scanned barcode
  useEffect(() => {
    if (scannedBarcode) {
      setFormData((prev) => ({ ...prev, barcode: scannedBarcode }))
    }
  }, [scannedBarcode])

  // Load storage locations
  useEffect(() => {
    try {
      let saved = null
      if (householdId) saved = localStorage.getItem(`storage-locations:${householdId}`)
      if (!saved) saved = localStorage.getItem('storage-locations')
      if (saved) setStorageLocations(JSON.parse(saved))
      else setStorageLocations([])
    } catch (err) {
      console.warn('Failed to load storage locations:', err)
      setStorageLocations([])
    }
  }, [householdId])

  const applyOpenFoodFacts = (prod) => {
    if (!prod) return
    setFormData((prev) => ({
      ...prev,
      productName: prod.productName || prev.productName,
      barcode: prod.barcode || prev.barcode,
      brand: prod.brand || prev.brand,
      ingredients: prod.ingredients || prev.ingredients,
      nutritionInfo: prod.nutritionInfo || prev.nutritionInfo,
      packageSize: prod.packageSize || prev.packageSize,
      category: prod.category || prev.category,
    }))
  }

  const doLookupBarcode = async (barcode) => {
    setLookupError(null)
    if (!barcode) return
    setLookupLoading(true)
    try {
      const prod = await import('../services/openFoodFacts').then(m => m.lookupByBarcode(barcode))
      applyOpenFoodFacts(prod)
    } catch (err) {
      console.warn('OF lookup failed', err)
      setLookupError(err.message || 'Lookup failed')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    const newValue = type === 'checkbox' ? checked : value
    setFormData((prev) => ({ ...prev, [name]: newValue }))
  }

  const handleAllergenChange = (allergens) => {
    setFormData((prev) => ({ ...prev, allergens }))
  }

  const handleDietaryChange = (dietary) => {
    setFormData((prev) => ({ ...prev, dietaryRestrictions: dietary }))
  }

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
      if (formData.allowGracePeriod) {
        const months = parseInt(formData.gracePeriodMonths, 10)
        if (isNaN(months) || months < 0) {
          throw new Error('Grace period months must be a non-negative integer')
        }
      }

      // Save ALL fields from formData, converting arrays to comma-separated strings for DB
      const itemToSave = { ...formData }
      // Convert array fields to comma-separated strings for DB storage
      if (Array.isArray(itemToSave.allergens)) itemToSave.allergens = itemToSave.allergens.join(',')
      if (Array.isArray(itemToSave.dietaryRestrictions)) itemToSave.dietaryRestrictions = itemToSave.dietaryRestrictions.join(',')
      // Normalize booleans and numbers
      itemToSave.allowGracePeriod = !!formData.allowGracePeriod
      itemToSave.gracePeriodMonths = formData.allowGracePeriod ? parseInt(formData.gracePeriodMonths, 10) || 0 : 0
      itemToSave.prescriptionRequired = !!formData.prescriptionRequired

      // Add/override any additional fields as needed
      itemToSave.addedDate = new Date().toISOString()

      if (itemId) {
        try {
          await updateInventoryItem(itemId, itemToSave)
        } catch (err) {
          if (err && err.code === 'conflict') {
            const remote = await getInventoryById(itemId)
            const local = await getInventoryItem(itemId)
            const choice = await openConflictModal({ local: { ...local }, remote: { ...remote } })
            if (choice.action === 'keepLocal') {
              await updateInventoryItemForce(itemId, itemToSave)
            } else if (choice.action === 'useRemote') {
              await fetchFromCloud(householdId)
            } else {
              setError('Edit cancelled due to conflict')
              return
            }
          } else {
            throw err
          }
        }
      } else {
        const newId = await addInventoryItem(itemToSave, householdId)
        if (!isOnline) {
          await trackChange('inventory', newId, 'create')
        }
        setFormData(EMPTY_FORM)
      }
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
              placeholder="Enter or scan barcode"
              required={config.mandatory}
              style={{ width: '100%', minWidth: 160, fontSize: '1.1em', letterSpacing: '0.08em', marginBottom: 8 }}
              autoComplete="off"
              inputMode="numeric"
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" title="Scan barcode" onClick={onOpenScanner}>📷</button>
              <button type="button" className="btn btn-secondary" onClick={() => doLookupBarcode(value)} disabled={!value || lookupLoading}>
                {lookupLoading ? '…' : 'Lookup'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setOfModalOpen(true)}>
                Search
              </button>
            </div>
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
              placeholder="Product name"
              required={config.mandatory}
            />
          </div>
        )
      case 'category':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select id={fieldName} name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              <option value="water">Water</option>
              <option value="food">Food</option>
              <option value="first-aid">First Aid</option>
              <option value="tools">Tools</option>
              <option value="light">Light</option>
              <option value="documents">Documents</option>
              <option value="special-needs">Special Needs</option>
              <option value="other">Other</option>
            </select>
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
              min="0"
              step="1"
              required={config.mandatory}
            />
          </div>
        )
      case 'unit':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select id={fieldName} name={fieldName} value={value} onChange={handleChange}>
              <option value="pcs">pcs</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="L">L</option>
              <option value="mL">mL</option>
              <option value="box">box</option>
              <option value="pack">pack</option>
            </select>
          </div>
        )
      case 'expiryDate':
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
      case 'allergens':
        return (
          <div key={fieldName} className="form-group">
            <label>{label}</label>
            <AllergenCheckboxes value={formData.allergens} onChange={handleAllergenChange} />
          </div>
        )
      case 'cost':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <input
              id={fieldName}
              type="number"
              name={fieldName}
              value={value}
              onChange={handleChange}
              min="0"
              step="0.01"
              required={config.mandatory}
            />
          </div>
        )
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
      case 'itemStatus':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select id={fieldName} name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              <option value="unopened">Unopened</option>
              <option value="opened">Opened</option>
              <option value="expired">Expired</option>
              <option value="damaged">Damaged</option>
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
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select id={fieldName} name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              <option value="">Select location</option>
              {storageLocations.map((loc) => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </div>
        )
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
              type="text"
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
            {itemId ? 'Edit Item' : 'Add Item to Inventory'}{householdName ? ` — ${householdName}` : ''}
          </h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="inventory-form">
          {visibleFields.includes('barcode') && visibleFields.includes('productName') && (
            <>
              {renderField('barcode')}
              {renderField('productName')}
              {renderField('category')}
            </>
          )}

          {(visibleFields.includes('quantity') || visibleFields.includes('unit')) && (
            <div className="form-row">
              {renderField('quantity')}
              {renderField('unit')}
            </div>
          )}

          {renderField('expiryDate')}

          <div className="form-group">
            <label className="checkbox-label grace-checkbox-label">
              <input
                id="allowGracePeriod"
                className="grace-checkbox"
                type="checkbox"
                name="allowGracePeriod"
                checked={formData.allowGracePeriod}
                onChange={handleChange}
              />
              <span style={{ marginLeft: '0.5rem' }}>Allow grace period</span>
            </label>
          </div>

          {formData.allowGracePeriod && (
            <div className="form-group">
              <label htmlFor="gracePeriodMonths">Grace period (months)</label>
              <input
                id="gracePeriodMonths"
                type="number"
                name="gracePeriodMonths"
                value={formData.gracePeriodMonths}
                onChange={handleChange}
                min="0"
                step="1"
              />
            </div>
          )}

          {renderField('allergens')}

          <div className="form-group">
            <label htmlFor="brand">Brand</label>
            <input id="brand" name="brand" type="text" value={formData.brand} onChange={handleChange} />
          </div>

          {formData.category === 'food' && (
            <>
              <div className="form-group">
                <label htmlFor="ingredients">Ingredients</label>
                <textarea id="ingredients" name="ingredients" value={formData.ingredients} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="packageSize">Package size / net weight</label>
                <input id="packageSize" name="packageSize" type="text" value={formData.packageSize} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="caloriesPerServing">Calories per serving</label>
                <input id="caloriesPerServing" name="caloriesPerServing" type="number" value={formData.caloriesPerServing} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="servingsPerPackage">Servings per package</label>
                <input id="servingsPerPackage" name="servingsPerPackage" type="number" value={formData.servingsPerPackage} onChange={handleChange} />
              </div>
            </>
          )}

          {formData.category === 'first-aid' && (
            <>
              <div className="form-group">
                <label htmlFor="manufacturer">Manufacturer</label>
                <input id="manufacturer" name="manufacturer" type="text" value={formData.manufacturer} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="medicationForm">Form (e.g., tablet, ointment)</label>
                <input id="medicationForm" name="medicationForm" type="text" value={formData.medicationForm} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>
                  <input type="checkbox" name="prescriptionRequired" checked={formData.prescriptionRequired} onChange={handleChange} /> Prescription required
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="dosage">Dosage / Strength</label>
                <input id="dosage" name="dosage" type="text" value={formData.dosage} onChange={handleChange} />
              </div>
            </>
          )}

          {formData.category === 'water' && (
            <div className="form-group">
              <label htmlFor="packageSize">Volume</label>
              <input id="packageSize" name="packageSize" type="text" value={formData.packageSize} onChange={handleChange} />
            </div>
          )}

          {formData.category === 'light' && (
            <>
              <div className="form-group">
                <label htmlFor="lumen">Lumen (brightness)</label>
                <input id="lumen" name="lumen" type="number" value={formData.lumen} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="batteryCapacity">Battery capacity (mAh)</label>
                <input id="batteryCapacity" name="batteryCapacity" type="number" value={formData.batteryCapacity} onChange={handleChange} />
              </div>
            </>
          )}

          {formData.category === 'tools' && (
            <>
              <div className="form-group">
                <label htmlFor="batteryChemistry">Battery type / chemistry</label>
                <input id="batteryChemistry" name="batteryChemistry" type="text" value={formData.batteryChemistry} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="batteryCapacity">Battery capacity (mAh)</label>
                <input id="batteryCapacity" name="batteryCapacity" type="number" value={formData.batteryCapacity} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="powerRating">Power rating (e.g., W/V)</label>
                <input id="powerRating" name="powerRating" type="text" value={formData.powerRating} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="manufactureDate">Manufacture date</label>
                <input id="manufactureDate" name="manufactureDate" type="date" value={formData.manufactureDate} onChange={handleChange} />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="countryOfOrigin">Country of origin</label>
            <input id="countryOfOrigin" name="countryOfOrigin" type="text" value={formData.countryOfOrigin} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="storageInstructions">Storage instructions</label>
            <input id="storageInstructions" name="storageInstructions" type="text" value={formData.storageInstructions} onChange={handleChange} />
          </div>

          {formData.category === 'documents' && (
            <>
              <div className="form-group">
                <label htmlFor="documentsType">Document type</label>
                <input id="documentsType" name="documentsType" type="text" value={formData.documentsType} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="containerType">Storage container</label>
                <input id="containerType" name="containerType" type="text" value={formData.containerType} onChange={handleChange} />
              </div>
            </>
          )}

          {formData.category === 'special-needs' && (
            <div className="form-group">
              <label htmlFor="specialNeedsDetails">Details / instructions</label>
              <textarea id="specialNeedsDetails" name="specialNeedsDetails" value={formData.specialNeedsDetails} onChange={handleChange} />
            </div>
          )}

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
          {lookupError && <div className="form-error">{lookupError}</div>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : itemId ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
      <OpenFoodFactsSearchModal isOpen={ofModalOpen} onClose={() => setOfModalOpen(false)} onSelect={(p) => { applyOpenFoodFacts(p); setOfModalOpen(false) }} />
    </div>
  )
}
