import { useState, useRef } from 'react'

const decodeWithQuagga = (src) =>
  new Promise((resolve, reject) => {
    import('@ericblade/quagga2').then(({ default: Quagga }) => {
      Quagga.decodeSingle(
        {
          src,
          numOfWorkers: 0,
          inputStream: { size: 1200 },
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
            ],
          },
          locate: true,
        },
        (result) => {
          if (result && result.codeResult) {
            resolve(result.codeResult.code)
          } else {
            reject(new Error('No barcode detected'))
          }
        }
      )
    })
  })

export default function BarcodeScanner({ isOpen, onClose, onBarcodeDetected }) {
  const [barcode, setBarcode] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  if (!isOpen) return null

  const handleFileCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessing(true)
    setError(null)
    const src = URL.createObjectURL(file)
    try {
      // Try native BarcodeDetector first (iOS 17+, Chrome 83+)
      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'],
          })
          const img = await createImageBitmap(file)
          const barcodes = await detector.detect(img)
          if (barcodes.length > 0) {
            onBarcodeDetected(barcodes[0].rawValue)
            return
          }
        } catch (_) {}
      }
      // Fallback: quagga2 (best for EAN/UPC from photos)
      const code = await decodeWithQuagga(src)
      onBarcodeDetected(code)
    } catch (err) {
      setError('No barcode found. Try again with better lighting and hold the camera steady, or enter the barcode manually.')
    } finally {
      URL.revokeObjectURL(src)
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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

        {/* Hidden file input — capture="environment" opens back camera on iOS */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileCapture}
        />

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          {isProcessing ? '⏳ Reading barcode...' : '📷 Open Camera to Scan'}
        </button>

        {error && (
          <p style={{ color: 'var(--color-white)', background: 'var(--color-danger, #c0392b)', borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: '0.9em' }}>
            ❌ {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="barcode-form">
          <input
            type="text"
            placeholder="Or enter barcode manually"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
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
