import React from 'react'
import { getDetailedCompleteness, getDsbBaseline } from '../constants/dsb-baseline'
import './DsbChecklist.css'

// Items that scale per person
const SCALED_ITEMS = ['water', 'food', 'medications', 'hygiene', 'warmth']
// Fixed items regardless of household size
const FIXED_ITEMS = ['firstAid', 'light', 'documents', 'tools']

export default function DsbChecklist({ inventoryByCategory = {}, totalPersons = 1 }) {
  const dsbData = getDsbBaseline()
  
  // Scale baseline targets based on household size
  const scaledBaseline = { ...dsbData }
  SCALED_ITEMS.forEach(item => {
    if (scaledBaseline[item]) {
      scaledBaseline[item] = {
        ...scaledBaseline[item],
        target: dsbData[item].target * totalPersons,
        originalTarget: dsbData[item].target
      }
    }
  })
  
  // Get detailed stats with scaled baselines
  const detailedStats = getDetailedCompleteness(inventoryByCategory).map(item => {
    if (SCALED_ITEMS.includes(item.category) && scaledBaseline[item.category]) {
      const scaledTarget = scaledBaseline[item.category].target
      const percentage = Math.min(100, Math.round((item.current / scaledTarget) * 100))
      return {
        ...item,
        target: scaledTarget,
        isComplete: item.current >= scaledTarget,
        percentage,
        remaining: Math.max(0, scaledTarget - item.current)
      }
    }
    return item
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
              {dsbData[item.category].description}
              {SCALED_ITEMS.includes(item.category) && (
                <span className="per-person"> ({dsbData[item.category].target} {item.unit} per person)</span>
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
