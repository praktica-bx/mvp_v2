  // Remove must-have item fields logic (no longer needed)

  // Helper: check if current item is a must-have for the selected category
  const mustHaveList = getMustHaveItems(formData.category, totalPersons)
  const isMustHave = mustHaveList.some(item =>
    item.name.trim().toLowerCase() === (formData.productName || '').trim().toLowerCase()
  )

  // Helper: comma-separated must-have names for info text
  const mustHaveNames = mustHaveList.map(item => item.name).join(', ')
// Helper to normalize expiry date to MM.YYYY
function normalizeExpiryDate(raw) {
  if (!raw) return '';
  if (/^\d{2}\.\d{4}$/.test(raw)) return raw;
  // If DD.MM.YYYY, split and use MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('.')
    return `${mm}.${yyyy}`;
  }
  // Try ISO or other formats
  const d = new Date(raw);
  if (!isNaN(d)) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}.${yyyy}`;
  }
  return raw;
}
import { useState, useEffect } from 'react'
import AllergenCheckboxes from './AllergenCheckboxes'
import OpenFoodFactsSearchModal from './OpenFoodFactsSearchModal'
import { useConflictModal } from '../contexts/ConflictModalContext'
import {
  fetchStorageLocations,
  ensureNhostReady,
  isNhostConfigured,
  isNhostAuthenticated,
} from '../nhost'
import { SUPPLY_CATEGORIES } from '../constants/categories'
import { getDsbBaseline } from '../constants/dsb-baseline'
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


// Helper to get must-have items for a category
function getMustHaveItems(category, totalPersons = 1) {
  const dsb = getDsbBaseline()
  const cat = SUPPLY_CATEGORIES.find(c => c.value === category)
  if (!cat || !cat.dsbCategory || !dsb[cat.dsbCategory] || !dsb[cat.dsbCategory].mustHave) return []
  return dsb[cat.dsbCategory].mustHave.map(item => ({
    ...item,
    quantity: item.perPerson ? item.quantity * totalPersons : item.quantity
  }))
}

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

export default function InventoryForm({ itemId = null, onSave, onCancel, onOpenScanner, scannedBarcode, isOnline = true, householdId, householdName, totalPersons = 1 }) {
  const { openConflictModal } = useConflictModal()

  const [formData, setFormData] = useState(EMPTY_FORM)
  const [mustHaveValues, setMustHaveValues] = useState({})
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
          // Only use MM.YYYY for expiryDate
            const expiryDate = normalizeExpiryDate(item.expiryDate || item.expiry_date || '')
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

  // Load storage locations from cloud
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!householdId) return
      try {
        await ensureNhostReady()
        if (isNhostConfigured() && isNhostAuthenticated()) {
          const locs = await fetchStorageLocations(householdId)
          if (!cancelled) setStorageLocations(locs)
        }
      } catch (err) {
        console.warn('Failed to load storage locations from cloud:', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [householdId])

  const applyOpenFoodFacts = (prod) => {
    if (!prod) return;
    console.log('[applyOpenFoodFacts] Product received:', prod);
    // Normalize allergen tags to plain names (e.g., en:milk -> milk)
    let allergens = [];
    if (Array.isArray(prod.allergens_tags)) {
      allergens = prod.allergens_tags.map(tag => tag.split(':')[1] || tag);
    } else if (prod.allergens_tags) {
      allergens = prod.allergens_tags.split(',').map(tag => tag.split(':')[1] || tag);
    }
    setFormData(prev => ({
      ...EMPTY_FORM,
      ...prev, // preserve any user input not covered by OFF
      productName: prod.product_name || prod.product_name_en || prod.generic_name || prod.productName || '',
      barcode: prod.code || prod.barcode || '',
      brand: prod.brands || prod.brand || '',
      quantity: Number(prod.quantity) || 1,
      unit: prod.unit || (prod.quantity && typeof prod.quantity === 'string' && prod.quantity.replace(/\d+/g, '').trim()) || 'pcs',
      ingredients: prod.ingredients_text || prod.ingredients || '',
      nutritionInfo: prod.nutrition_grades_tags?.join(', ') || '',
      packageSize: prod.quantity || '',
      category: (prod.categories_tags && prod.categories_tags[0]) || prod.category || 'water',
      allergens,
      dietaryRestrictions: Array.isArray(prod.dietary_tags) ? prod.dietary_tags : (prod.dietary_tags ? prod.dietary_tags.split(',') : []),
      storageNotes: prod.storage_notes || '',
      supplier: prod.stores || '',
      preferredConsumptionDate: prod.preferred_consumption_date || '',
      purchaseDate: prod.purchase_date || new Date().toISOString().split('T')[0],
      cost: prod.price || '',
      lotNumber: prod.lot_number || '',
      packaging: prod.packaging || '',
      countryOfOrigin: (prod.countries_tags && prod.countries_tags[0]) || '',
      storageInstructions: prod.storage_instructions || '',
      manufacturer: prod.manufacturer || '',
      dosage: prod.dosage || '',
      caloriesPerServing: prod.nutriments?.['energy-kcal_serving'] || '',
      servingsPerPackage: prod.serving_size || '',
      // Add more mappings as needed
    }));
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
        // Validate must-have items for the selected category
        const mustHaves = getMustHaveItems(formData.category, totalPersons)
        for (const item of mustHaves) {
          if (!item.optional && (!mustHaveValues[item.name] || Number(mustHaveValues[item.name]) < item.quantity)) {
            throw new Error(`Must have at least ${item.quantity} ${item.unit} of ${item.name}`)
          }
        }
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
      // Ensure expiryDate is MM.YYYY for storage
      itemToSave.expiryDate = normalizeExpiryDate(itemToSave.expiryDate);
      // Convert array fields to comma-separated strings for DB storage
      if (Array.isArray(itemToSave.allergens)) itemToSave.allergens = itemToSave.allergens.join(',')
      if (Array.isArray(itemToSave.dietaryRestrictions)) itemToSave.dietaryRestrictions = itemToSave.dietaryRestrictions.join(',')
      // Normalize booleans and numbers
      itemToSave.allowGracePeriod = !!formData.allowGracePeriod
      itemToSave.gracePeriodMonths = formData.allowGracePeriod ? parseInt(formData.gracePeriodMonths, 10) || 0 : 0
      itemToSave.prescriptionRequired = !!formData.prescriptionRequired
      // Store must-have item values
      itemToSave.mustHave = mustHaveValues

      // Only stamp addedDate when creating (not editing — preserve original creation date)
      if (!itemId) {
        itemToSave.addedAt = new Date().toISOString()
      }
      // Remove legacy/transient fields that should not be stored in IDB user data
      delete itemToSave.addedDate

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
            {/* Must-have item checkbox (read-only) */}
            {formData.category && value && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={isMustHave} readOnly style={{ pointerEvents: 'none' }} />
                <span style={{ fontSize: '0.95em', color: isMustHave ? '#1a7f37' : '#888' }}>
                  This is a must-have item
                </span>
              </div>
            )}
          </div>
        )
      case 'category':
        return (
          <div key={fieldName} className="form-group">
            <label htmlFor={fieldName}>{label}</label>
            <select id={fieldName} name={fieldName} value={value} onChange={handleChange} required={config.mandatory}>
              {SUPPLY_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            {/* Must-have info text */}
            {mustHaveNames && (
              <div style={{ fontSize: '0.92em', color: '#888', marginTop: 4 }}>
                Must-have items for this category: {mustHaveNames}
              </div>
            )}
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
              type="text"
              name={fieldName}
              value={value}
              onChange={handleChange}
              required={config.mandatory}
              pattern="\d{2}\.\d{4}"
              placeholder="MM.YYYY"
              inputMode="numeric"
              maxLength={7}
            />
            <small>Format: MM.YYYY (e.g. 05.2026)</small>
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

  // Render must-have item fields for the selected category
  const renderMustHaveFields = () => {
    const mustHaves = getMustHaveItems(formData.category, totalPersons)
    if (!mustHaves.length) return null
    return (
      <div className="must-have-fields">
        <h4>Must-have items for this category:</h4>
        {mustHaves.map(item => (
          <div key={item.name} className="form-group">
            <label htmlFor={`musthave-${item.name}`}>{item.name} ({item.quantity} {item.unit}{item.perPerson ? ' per person' : ''})</label>
            <input
              id={`musthave-${item.name}`}
              type="number"
              min="0"
              name={item.name}
              value={mustHaveValues[item.name] || ''}
              onChange={e => handleMustHaveChange(item.name, e.target.value)}
              required={!item.optional}
            />
          </div>
        ))}
      </div>
    )
  }

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
          {/* Must-have fields removed: now handled by checklist only */}
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
      <OpenFoodFactsSearchModal
        isOpen={ofModalOpen}
        onClose={() => setOfModalOpen(false)}
        onSelect={(p) => {
          // Fill the form, then close the modal after a tick to ensure state update
          applyOpenFoodFacts(p);
          setTimeout(() => setOfModalOpen(false), 0);
        }}
      />
    </div>
  )
}
