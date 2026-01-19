import React from 'react'
import './ColorSwatch.css'
import { themes, getThemeNames } from '../constants/themes'

function ColorRow({ varName, hex }) {
  const textColor = (function pickTextColor(hexVal) {
    // simple luminance check to pick black/white text for contrast
    if (!hexVal) return '#000'
    const c = hexVal.replace('#','')
    const r = parseInt(c.substring(0,2),16)
    const g = parseInt(c.substring(2,4),16)
    const b = parseInt(c.substring(4,6),16)
    const l = (0.2126*r + 0.7152*g + 0.0722*b)/255
    return l > 0.5 ? '#000' : 'var(--color-white)'
  })(hex)

  return (
    <div className="swatch-row">
      <div className="swatch-sample" style={{ background: hex, color: textColor }}>{hex} </div>
      <div className="swatch-meta">
        <div className="swatch-var">{varName}</div>
      </div>
    </div>
  )
}

export default function ColorSwatch({ onClose }) {
  const themeNames = getThemeNames()

  return (
    <div className="color-swatch-overlay" onClick={onClose}>
      <div className="color-swatch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="swatch-header">
          <h2>Color Schemes</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="swatch-list">
          {themeNames.map((tn) => {
            const t = themes[tn]
            return (
              <section className="theme-block" key={tn}>
                <h3 className="theme-name">{t.name} <span className="theme-key">({tn})</span></h3>
                <div className="theme-grid">
                  {Object.entries(t.colors).map(([k,v]) => (
                    <ColorRow key={k} varName={`--color-${k}`} hex={v} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
