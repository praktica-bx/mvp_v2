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
import { SUPPLY_CATEGORIES } from '../constants/categories'

export default function InventoryForm({ itemId = null, onSave, onCancel, onOpenScanner, scannedBarcode, isOnline = true, householdId, householdName }) {
  const [preferences, setPreferences] = useState(null)
  const [formData, setFormData] = useState({
    barcode: scannedBarcode || '',
    brand: '',
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
    batteryCapacity: '',
    lumen: '',
    caloriesPerServing: '',
    servingsPerPackage: 0,
    powerRating: '',
    medicationForm: '',
    documentsType: '',
    specialNeedsDetails: '',
    storageTemperature: '',
    containerType: '',
    allowGracePeriod: false,
    gracePeriodMonths: 0,
  })
            {itemId ? 'Edit Item' : 'Add Item to Inventory'}{householdName ? ` — ${householdName}` : ''}
  const [error, setError] = useState('')

  // Load field preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      const prefs = await getFieldPreferences()
      setPreferences(prefs)
    }
    loadPreferences()
  }, [])

  // Load item data if editing
  useEffect(() => {
    if (!itemId) return
    const loadItem = async () => {
      try {
        const local = await getInventoryItem(itemId)
        if (local) {
          // Map local fields into formData shape
          setFormData((prev) => ({
            ...prev,
            ...local,
            barcode: local.barcode || '',
            productName: local.productName || '',
            quantity: local.quantity || 1,
            unit: local.unit || 'pcs',
            expiryDate: local.expiryDate || '',
            category: local.category || 'water',
            allergens: local.allergens || [],
            storageLocation: local.storageLocation || '',
            cost: local.cost || '',
            purchaseDate: local.purchaseDate || new Date().toISOString().split('T')[0],
            preferredConsumptionDate: local.preferredConsumptionDate || '',
            supplier: local.supplier || '',
            storageNotes: local.storageNotes || '',
            itemStatus: local.itemStatus || 'unopened',
            lotNumber: local.lotNumber || '',
            nutritionInfo: local.nutritionInfo || '',
            dietaryRestrictions: local.dietaryRestrictions || [],
            priorityLevel: local.priorityLevel || 'important',
            packaging: local.packaging || '',
            allowGracePeriod: !!local.allowGracePeriod,
            gracePeriodMonths: local.gracePeriodMonths || 0,
            batteryCapacity: local.batteryCapacity || local.battery_capacity || '',
            lumen: local.lumen || '',
            caloriesPerServing: local.caloriesPerServing || local.calories_per_serving || '',
            servingsPerPackage: local.servingsPerPackage || local.servings_per_package || 0,
            powerRating: local.powerRating || local.power_rating || '',
            medicationForm: local.medicationForm || local.medication_form || '',
            documentsType: local.documentsType || local.documents_type || '',
            specialNeedsDetails: local.specialNeedsDetails || local.special_needs_details || '',
            storageTemperature: local.storageTemperature || local.storage_temperature || '',
            containerType: local.containerType || local.container_type || '',
          }))
        }
      } catch (err) {
        console.warn('Failed to load local item for edit:', err)
      }
    }
    loadItem()
  }, [itemId])

  const { open: openConflictModal } = useConflictModal()

  // Update barcode when scanned barcode changes and auto-lookup product
  useEffect(() => {
    if (scannedBarcode) {
      setFormData((prev) => ({ ...prev, barcode: scannedBarcode }))
      doLookupBarcode(scannedBarcode)
    }
  }, [scannedBarcode])

  const [ofModalOpen, setOfModalOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [storageLocations, setStorageLocations] = useState([])

  const applyOpenFoodFacts = (product) => {
    if (!product) return
    // Overwrite fields as requested
    setFormData((prev) => ({
      ...prev,
      productName: product.product_name || product.product_name_en || prev.productName,
      brand: product.brands || prev.brand,
      imageUrl: product.image_front_small_url || product.image_url || prev.imageUrl,
      ingredients: product.ingredients_text || prev.ingredients,
      allergens: product.allergens_tags ? product.allergens_tags.map(a => a.replace('en:', '')) : prev.allergens,
      nutritionInfo: product.nutriments || prev.nutritionInfo,
      packaging: product.packaging || prev.packaging,
      quantity: product.quantity || prev.quantity,
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

  useEffect(() => {
    const loadLocations = () => {
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
    }
    loadLocations()
  }, [householdId])

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

      // Grace period validation
      if (formData.allowGracePeriod) {
        const months = parseInt(formData.gracePeriodMonths, 10)
        if (isNaN(months) || months < 0) {
          throw new Error('Grace period months must be a non-negative integer')
        }
      }

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
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (itemId ? 'Save Changes' : 'Add Item')}
      // Always include grace period fields
      itemToSave.allowGracePeriod = !!formData.allowGracePeriod
      itemToSave.gracePeriodMonths = formData.allowGracePeriod ? parseInt(formData.gracePeriodMonths, 10) || 0 : 0

      // Include added category-dependent fields
      itemToSave.brand = formData.brand || null
      itemToSave.ingredients = formData.ingredients || null
      itemToSave.packageSize = formData.packageSize || null
      itemToSave.countryOfOrigin = formData.countryOfOrigin || null
      itemToSave.storageInstructions = formData.storageInstructions || null
      itemToSave.manufacturer = formData.manufacturer || null
      itemToSave.prescriptionRequired = !!formData.prescriptionRequired
      itemToSave.dosage = formData.dosage || null
      itemToSave.batteryChemistry = formData.batteryChemistry || null
      itemToSave.manufactureDate = formData.manufactureDate || null
      itemToSave.batteryCapacity = formData.batteryCapacity || null
      itemToSave.lumen = formData.lumen || null
      itemToSave.caloriesPerServing = formData.caloriesPerServing || null
      itemToSave.servingsPerPackage = formData.servingsPerPackage || null
      itemToSave.powerRating = formData.powerRating || null
      itemToSave.medicationForm = formData.medicationForm || null
      itemToSave.documentsType = formData.documentsType || null
      itemToSave.specialNeedsDetails = formData.specialNeedsDetails || null
      itemToSave.storageTemperature = formData.storageTemperature || null
      itemToSave.containerType = formData.containerType || null

      let savedId = null
      if (itemId) {
        // EDIT existing
        try {
          await updateInventoryItem(itemId, itemToSave)
          savedId = itemId
        } catch (err) {
          // Conflict from pre-write remote check
          if (err && err.code === 'conflict') {
            try {
              const remote = await getInventoryById(itemId)
              const local = await getInventoryItem(itemId)
              const choice = await openConflictModal({ local: { ...local }, remote: { ...remote } })
              if (choice.action === 'keepLocal') {
                await updateInventoryItemForce(itemId, itemToSave)
                savedId = itemId
              } else if (choice.action === 'useRemote') {
                // Pull remote changes for the household and refresh
                await fetchFromCloud(householdId)
                // Do not overwrite remote; treat remote as authoritative
                savedId = itemId
              } else {
                // cancel
                setError('Edit cancelled due to conflict')
                setLoading(false)
                return
              }
            } catch (modalErr) {
              console.error('Conflict resolution failed:', modalErr)
              setError('Conflict resolution failed')
              setLoading(false)
              return
            }
          } else {
            throw err
          }
        }
      } else {
        // CREATE new
        const newId = await addInventoryItem(itemToSave, householdId)
        savedId = newId

        // If offline, track this for sync
        if (!isOnline) {
          await trackChange('inventory', newId, 'create')
          setError('') // Clear any previous errors
        }
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
              {renderField('category')}
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
          {/* Grace period: checkbox + months */}
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

          {/* Category-dependent fields */}
          {/* Brand (general) */}
          <div className="form-group">
            <label htmlFor="brand">Brand</label>
            <input id="brand" name="brand" type="text" value={formData.brand} onChange={handleChange} />
          </div>

          {/* Food-specific */}
          {formData.category === 'food' && (
            <>
              <div className="form-group">
                <label htmlFor="ingredients">Ingredients</label>
                <textarea id="ingredients" name="ingredients" value={formData.ingredients} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="nutritionInfo">Nutrition (raw)</label>
                <textarea id="nutritionInfo" name="nutritionInfo" value={formData.nutritionInfo} onChange={handleChange} />
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

          {/* First aid / meds */}
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

          {/* Water / liquids */}
          {formData.category === 'water' && (
            <div className="form-group">
              <label htmlFor="packageSize">Volume</label>
              <input id="packageSize" name="packageSize" type="text" value={formData.packageSize} onChange={handleChange} />
            </div>
          )}

          {/* Light / lighting specific */}
          {formData.category === 'light' && (
            <>
              <div className="form-group">
                <label htmlFor="lumen">Lumen (brightness)</label>
                <input id="lumen" name="lumen" type="number" value={formData.lumen} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="batteryCapacity">Battery capacity (mAh) — if applicable</label>
                <input id="batteryCapacity" name="batteryCapacity" type="number" value={formData.batteryCapacity} onChange={handleChange} />
              </div>
            </>
          )}

          {/* Tools / batteries */}
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

          {/* General additional info */}
          <div className="form-group">
            <label htmlFor="countryOfOrigin">Country of origin</label>
            <input id="countryOfOrigin" name="countryOfOrigin" type="text" value={formData.countryOfOrigin} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="storageInstructions">Storage instructions</label>
            <input id="storageInstructions" name="storageInstructions" type="text" value={formData.storageInstructions} onChange={handleChange} />
          </div>

          {/* Documents-specific */}
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

          {/* Special needs */}
          {formData.category === 'special-needs' && (
            <div className="form-group">
              <label htmlFor="specialNeedsDetails">Details / instructions</label>
              <textarea id="specialNeedsDetails" name="specialNeedsDetails" value={formData.specialNeedsDetails} onChange={handleChange} />
            </div>
          )}

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
          {lookupError && <div className="form-error">{lookupError}</div>}

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
      <OpenFoodFactsSearchModal isOpen={ofModalOpen} onClose={() => setOfModalOpen(false)} onSelect={(p) => { applyOpenFoodFacts(p); setOfModalOpen(false) }} />
    </div>
  )
}
