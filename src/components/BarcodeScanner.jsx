import { useState, useRef } from 'react'

export default function BarcodeScanner({ isOpen, onClose, onBarcodeDetected }) {
  const [barcode, setBarcode] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const inputRef = useRef(null)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (barcode.trim()) {
      onBarcodeDetected(barcode)
      setBarcode('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal u-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Scan or Enter Barcode</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="barcode-form">
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter 13-digit barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoFocus
            className="barcode-input"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        <p className="form-hint">Formats: EAN-13, EAN-8, UPC-A</p>
      </div>
    </div>
  )
}
