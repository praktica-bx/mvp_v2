
import { useState, useRef, useEffect } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'

export default function BarcodeScanner({ isOpen, onClose, onBarcodeDetected }) {

  const [barcode, setBarcode] = useState('')
  const [isScanning, setIsScanning] = useState(true)
  const inputRef = useRef(null)
  const scannerRef = useRef(null)


  useEffect(() => {
    if (isScanning && isOpen && scannerRef.current) {
      // Clean up previous scanner if any
      if (window.html5QrcodeScanner) {
        window.html5QrcodeScanner.clear().catch(() => {})
        window.html5QrcodeScanner = null
      }
      window.html5QrcodeScanner = new Html5QrcodeScanner(
        scannerRef.current.id,
        { fps: 10, qrbox: 250, formatsToSupport: ["EAN_13", "EAN_8", "UPC_A"] },
        false
      )
      window.html5QrcodeScanner.render(
        (decodedText) => {
          setIsScanning(false)
          setBarcode(decodedText)
          onBarcodeDetected(decodedText)
        },
        (error) => {
          // Optionally handle scan errors
        }
      )
    }
    return () => {
      if (window.html5QrcodeScanner) {
        window.html5QrcodeScanner.clear().catch(() => {})
        window.html5QrcodeScanner = null
      }
    }
  }, [isScanning, isOpen])

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
        {isScanning && (
          <div style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
            <div id="barcode-scanner" ref={scannerRef} style={{ width: '100%' }} />
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
