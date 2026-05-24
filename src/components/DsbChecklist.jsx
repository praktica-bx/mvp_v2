import React from 'react'
import { getDsbBaseline } from '../constants/dsb-baseline'
import { SUPPLY_CATEGORIES } from '../constants/categories'
import './DsbChecklist.css'


// Map SUPPLY_CATEGORIES to DSB baseline keys
const CATEGORY_TO_DSB = SUPPLY_CATEGORIES.reduce((acc, cat) => {
  if (cat.dsbCategory) acc[cat.value] = cat.dsbCategory
  return acc
}, {})

// Only use DSB baseline categories that are mapped from SUPPLY_CATEGORIES
const DSB_KEYS = Array.from(new Set(Object.values(CATEGORY_TO_DSB)))

// Items that scale per person (from DSB baseline)
const SCALED_ITEMS = ['water', 'food', 'medications', 'hygiene', 'warmth']

export default function DsbChecklist({ inventoryByCategory = {}, totalPersons = 1 }) {
  const dsbData = getDsbBaseline()

  // Build checklist items based on SUPPLY_CATEGORIES and DSB mapping
  const detailedStats = SUPPLY_CATEGORIES.filter(cat => cat.dsbCategory && dsbData[cat.dsbCategory])
    .map(cat => {
      const dsbKey = cat.dsbCategory
      const dsb = dsbData[dsbKey]
      // Scale target if needed
      const isScaled = SCALED_ITEMS.includes(dsbKey)
      const target = isScaled ? dsb.target * totalPersons : dsb.target
      const current = inventoryByCategory[cat.value] || 0
      const percentage = Math.min(100, Math.round((current / target) * 100))
      return {
        category: cat.value,
        dsbCategory: dsbKey,
        name: dsb.name,
        description: dsb.description,
        target,
        unit: dsb.unit,
        current,
        percentage,
        isComplete: current >= target,
        remaining: Math.max(0, target - current),
      }
    })

  return (
    <div className="dsb-checklist">
      <div className="checklist-header">
        <h2>📋 Preparedness Checklist</h2>
        <p>Norwegian DSB baseline per person</p>
        <p className="household-info">Scaled for {totalPersons} person{totalPersons !== 1 ? 's' : ''} ({totalPersons === 1 ? 'no scaling' : `multiplied by ${totalPersons}`})</p>
      </div>

      <div className="checklist-items">
        {detailedStats.map((item) => (
          <div
            key={item.category}
            className={`checklist-item ${item.isComplete ? 'complete' : 'incomplete'}`}
          >
            <div className="item-header">
              <span className="item-name">{item.name}</span>
              <span className={`item-badge ${item.isComplete ? 'success' : 'pending'}`}>
                {item.percentage}%
              </span>
            </div>

            <p className="item-description">
              {item.description}
              {SCALED_ITEMS.includes(item.dsbCategory) && (
                <span className="per-person"> ({dsbData[item.dsbCategory].target} {item.unit} per person)</span>
              )}
            </p>

            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
              <div className="progress-text">
                {item.current} / {item.target} {item.unit}
              </div>
            </div>

            {!item.isComplete && item.remaining > 0 && (
              <div className="remaining">
                Need {item.remaining} more {item.unit}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="checklist-summary">
        <div className="summary-stat">
          <span className="stat-label">Categories Complete:</span>
          <span className="stat-value">
            {detailedStats.filter((item) => item.isComplete).length} / {detailedStats.length}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Overall Progress:</span>
          <span className="stat-value">
            {Math.round((detailedStats.filter((item) => item.isComplete).length / detailedStats.length) * 100)}%
          </span>
        </div>
      </div>

      <div className="checklist-footer">
        <p>
          <strong>Tip:</strong> Focus on completing categories in this order:
          Water → Food → Medications → First Aid → Hygiene → Warmth → Light → Documents → Tools
        </p>
      </div>
    </div>
  )
}
