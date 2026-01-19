import { useState, useEffect } from 'react'
import { getFieldPreferences, setFieldPreferences, resetFieldPreferences } from '../database'
import './FieldPreferencesManager.css'

export default function FieldPreferencesManager({ onClose }) {
  const [preferences, setPrefs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getFieldPreferences()
        setPrefs(prefs)
      } catch (err) {
        setError('Failed to load field preferences')
        console.error(err)
      }
    }
    loadPreferences()
  }, [])

  const handleToggleVisible = (fieldName) => {
    setPrefs((prev) => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        visible: !prev[fieldName].visible,
      },
    }))
  }

  const handleToggleMandatory = (fieldName) => {
    setPrefs((prev) => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        mandatory: !prev[fieldName].mandatory,
      },
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await setFieldPreferences(preferences)
      setSuccess('Field preferences saved successfully!')
      setTimeout(() => {
        setSuccess('')
      }, 3000)
    } catch (err) {
      setError('Failed to save field preferences')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (confirm('Reset all field preferences to defaults?')) {
      setLoading(true)
      try {
        const defaultPrefs = await resetFieldPreferences()
        setPrefs(defaultPrefs)
        setSuccess('Field preferences reset to defaults!')
        setTimeout(() => {
          setSuccess('')
        }, 3000)
      } catch (err) {
        setError('Failed to reset field preferences')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
  }

  if (!preferences) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Loading preferences...</div>
        </div>
      </div>
    )
  }

  const fieldGroups = {
    'Core Fields': ['barcode', 'productName', 'quantity', 'unit', 'expiryDate', 'category', 'allergens'],
    'Storage & Location': ['storageLocation', 'storageNotes'],
    'Dates': ['purchaseDate', 'preferredConsumptionDate'],
    'Cost & Supplier': ['cost', 'supplier'],
    'Item Details': ['itemStatus', 'lotNumber', 'packaging'],
    'Nutrition & Dietary': ['nutritionInfo', 'dietaryRestrictions'],
    'Prioritization': ['priorityLevel'],
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal field-preferences-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Inventory Fields</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="field-preferences-content">
          <p className="field-preferences-info">
            Select which fields appear in the inventory form and mark which ones are mandatory.
          </p>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <div className="field-groups">
            {Object.entries(fieldGroups).map(([groupName, fieldNames]) => (
              <div key={groupName} className="field-group">
                <h3 className="group-title">{groupName}</h3>
                <div className="field-list">
                  {fieldNames.map((fieldName) => {
                    const config = preferences[fieldName]
                    if (!config) return null

                    return (
                      <div key={fieldName} className="field-item">
                        <div className="field-label">
                          <span className="field-name">{config.label}</span>
                        </div>
                        <div className="field-controls">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={config.visible}
                              onChange={() => handleToggleVisible(fieldName)}
                              disabled={loading}
                            />
                            <span>Show</span>
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={config.mandatory}
                              onChange={() => handleToggleMandatory(fieldName)}
                              disabled={loading || !config.visible}
                            />
                            <span>Mandatory</span>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={loading}
          >
            Reset to Defaults
          </button>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
