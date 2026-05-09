
import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { QrReader } from 'react-qr-barcode-scanner'

export default function BarcodeScanner({ isOpen, onClose, onBarcodeDetected }) {

  const [barcode, setBarcode] = useState('')
  const [isScanning, setIsScanning] = useState(true)
  const inputRef = useRef(null)


  if (!isOpen) return null


  const handleSubmit = (e) => {
    e.preventDefault()
    if (barcode.trim()) {
      onBarcodeDetected(barcode)
      setBarcode('')
    }
  }

  const handleScan = (result) => {
    if (result && result.text) {
      setIsScanning(false)
      setBarcode(result.text)
      onBarcodeDetected(result.text)
    }
  }

  const handleError = (err) => {
    // Optionally show error to user
    setIsScanning(false)
    // fallback to manual entry
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal u-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Scan or Enter Barcode</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {isScanning && (
          <div style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
            <QrReader
              onResult={handleScan}
              constraints={{ facingMode: 'environment' }}
              style={{ width: '100%' }}
              onError={handleError}
            />
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setIsScanning(false)}>
              Cancel Camera
            </button>
          </div>
        )}
        {!isScanning && (
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
            <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => setIsScanning(true)}>
              Use Camera
            </button>
          </form>
        )}
        <p className="form-hint">Formats: EAN-13, EAN-8, UPC-A</p>
      </div>
    </div>
  )
}
