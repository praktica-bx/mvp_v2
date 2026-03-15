import { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import BarcodeScanner from './components/BarcodeScanner'
import InventoryForm from './components/InventoryForm'
import FieldPreferencesManager from './components/FieldPreferencesManager'
import OfflineWarning from './components/OfflineWarning'
import ThemeSwitcher from './components/ThemeSwitcher'
import BurgerMenu from './components/BurgerMenu'
import DsbChecklist from './components/DsbChecklist'
import Settings from './components/Settings'
import { ConflictModalProvider } from './contexts/ConflictModalContext'
import LoginScreen from './components/LoginScreen'
import HouseholdSelector from './components/HouseholdSelector'
import HouseholdOnboarding from './components/HouseholdOnboarding'
import HouseholdManagement from './components/HouseholdManagement'
import useOnlineStatus from './hooks/useOnlineStatus'
import useAuth from './hooks/useAuth'
import useHousehold from './hooks/useHousehold'
import { useTheme } from './hooks/useTheme'
import { getInventoryStats, getPendingSyncs, getInventoryByDsbCategory, fetchFromCloud, syncToCloud } from './database'
import { calculateDsbCompleteness } from './constants/dsb-baseline'

export default function App() {
  useTheme() // Initialize theme system
  const { user, isAuthenticated, isLoading: authLoading, handleAuthSuccess, logout, nhostConfigured } = useAuth()
  const { households, currentHousehold, isLoading: householdLoading, createNewHousehold, selectHousehold, joinHousehold, leaveHousehold, deleteHousehold, renameHousehold, inviteMember, removeMember, isFirstTime } = useHousehold()
  const [stats, setStats] = useState({ totalItems: 0, expiringSoon: 0, completeness: 0, inventoryByCategory: {} })
  const [showScanner, setShowScanner] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showFieldPreferences, setShowFieldPreferences] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHouseholdManagement, setShowHouseholdManagement] = useState(false)
  const [showPreparednessModal, setShowPreparednessModal] = useState(false)
  const [preparednessHousehold, setPreparednessHousehold] = useState(null)
  const [preparednessStats, setPreparednessStats] = useState({ inventoryByCategory: {}, totalPersons: 1 })
  const [scannedBarcode, setScannedBarcode] = useState(null)
  const { isOnline } = useOnlineStatus()
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  // Check for pending syncs and load stats

  const checkPendingSyncs = async () => {
    try {
      const pending = await getPendingSyncs()
      setPendingSyncCount(pending.length)
    } catch (error) {
      console.error('Error checking pending syncs:', error)
    }
  }

  const loadStats = async () => {
    try {
      if (!currentHousehold) return
      
      const inventoryStats = await getInventoryStats(currentHousehold.id)
      const inventoryByCategory = await getInventoryByDsbCategory(currentHousehold.id)
      
      // Get household settings (per-household, fall back to global)
      const householdMembers = parseInt(
        localStorage.getItem(`household:${currentHousehold.id}:members`) || localStorage.getItem('household-members') || '1'
      )
      const contingencyPersons = parseInt(
        localStorage.getItem(`household:${currentHousehold.id}:contingency`) || localStorage.getItem('contingency-persons') || '0'
      )
      const totalPersons = householdMembers + contingencyPersons
      
      const completeness = calculateDsbCompleteness(inventoryByCategory)
      setStats({ ...inventoryStats, completeness, householdMembers, contingencyPersons, totalPersons, inventoryByCategory })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  useEffect(() => {
    if (isOnline && currentHousehold) {
      (async () => { await checkPendingSyncs() })()
    }
  }, [isOnline, currentHousehold])

  useEffect(() => {
    if (currentHousehold) {
      (async () => { await loadStats() })()
    }
  }, [currentHousehold])

  // On auth + household, fetch recent cloud changes (if configured)
  useEffect(() => {
    if (isAuthenticated && currentHousehold && nhostConfigured) {
      let intervalId = null

      const runSync = async () => {
        try {
          // First push local changes, then pull remote updates
          await syncToCloud()
        } catch (e) {
          console.warn('Background push (syncToCloud) failed:', e)
        }

        try {
          await fetchFromCloud(currentHousehold.id)
          await loadStats()
          checkPendingSyncs()
        } catch (err) {
          console.warn('Background fetchFromCloud failed:', err)
        }
      }

      // Run immediately, then poll every 15s while active
      runSync()
      intervalId = setInterval(runSync, 15000)

      return () => {
        if (intervalId) clearInterval(intervalId)
      }
    }
  }, [isAuthenticated, currentHousehold?.id, nhostConfigured, loadStats])


  const openPreparednessForHousehold = async (household) => {
    try {
      if (!household) return
      const inventoryStats = await getInventoryStats(household.id)
      const inventoryByCategory = await getInventoryByDsbCategory(household.id)
      const householdMembers = parseInt(
        localStorage.getItem(`household:${household.id}:members`) || localStorage.getItem('household-members') || '1'
      )
      const contingencyPersons = parseInt(
        localStorage.getItem(`household:${household.id}:contingency`) || localStorage.getItem('contingency-persons') || '0'
      )
      const totalPersons = householdMembers + contingencyPersons
      const completeness = calculateDsbCompleteness(inventoryByCategory)
      setPreparednessStats({ ...inventoryStats, completeness, householdMembers, contingencyPersons, totalPersons, inventoryByCategory })
      setPreparednessHousehold(household)
      setShowPreparednessModal(true)
    } catch (error) {
      console.error('Error loading preparedness for household:', error)
    }
  }

  const handleBarcodeDetected = (barcode) => {
    console.log('Barcode detected:', barcode)
    setScannedBarcode(barcode)
    setShowScanner(false)
    setShowForm(true)
    // TODO: Look up barcode in database or catalog
  }

  const handleInventoryAdded = async () => {
    await loadStats()
    setShowForm(false)
  }

  return (
    <ConflictModalProvider>
      <div className="app">
      {authLoading ? (
        <div className="app-loading">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      ) : !isAuthenticated && nhostConfigured ? (
        <LoginScreen onAuthSuccess={handleAuthSuccess} />
      ) : isAuthenticated && isFirstTime ? (
        <HouseholdOnboarding
          onCreateHousehold={createNewHousehold}
          onJoinHousehold={joinHousehold}
          isLoading={householdLoading}
        />
      ) : isAuthenticated && !currentHousehold ? (
        <HouseholdSelector 
          households={households}
          onSelectHousehold={selectHousehold}
          onCreateHousehold={createNewHousehold}
          onJoinHousehold={joinHousehold}
          onLeaveHousehold={leaveHousehold}
          onDeleteHousehold={deleteHousehold}
          isLoading={householdLoading}
        />
      ) : (
        <>
          <OfflineWarning isOnline={isOnline} />
          
          {pendingSyncCount > 0 && isOnline && (
            <div className="sync-reminder">
              <span>📤 {pendingSyncCount} items waiting to sync</span>
            </div>
          )}

          <header className="app-header">
            <BurgerMenu 
              onScanBarcode={() => setShowScanner(true)}
              onAddManual={() => setShowForm(true)}
              onFieldSettings={() => setShowFieldPreferences(true)}
              onShowChecklist={() => setShowChecklist(true)}
              onShowSettings={() => setShowSettings(true)}
              onShowHouseholdManagement={() => setShowHouseholdManagement(true)}
              currentHousehold={currentHousehold}
              households={households}
              onSelectHousehold={selectHousehold}
              onViewPreparedness={openPreparednessForHousehold}
              user={user}
              onLogout={logout}
            />
            <div className="header-center">
              <h1>Emergency Supply</h1>
              <p>Track your supplies with expiry dates</p>
            </div>
            <ThemeSwitcher />
          </header>

          <main className="app-main">
            <Dashboard stats={stats} />

            <div className="quick-actions">
              <button className="btn btn-primary" onClick={() => setShowScanner(true)}>
                📱 Scan Barcode
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(true)}>
                ➕ Add Item Manually
              </button>
            </div>
          </main>

          {showScanner && (
            <BarcodeScanner
              isOpen={showScanner}
              onClose={() => setShowScanner(false)}
              onBarcodeDetected={handleBarcodeDetected}
            />
          )}

          {showForm && (
            <InventoryForm
              onSave={handleInventoryAdded}
              onCancel={() => {
                setShowForm(false)
                setScannedBarcode(null)
              }}
              onOpenScanner={() => {
                setShowForm(false)
                setShowScanner(true)
              }}
              scannedBarcode={scannedBarcode}
              householdId={currentHousehold?.id}
              householdName={currentHousehold?.name}
              isOnline={isOnline}
            />
          )}

          {showFieldPreferences && (
            <FieldPreferencesManager
              onClose={() => setShowFieldPreferences(false)}
            />
          )}

          {showChecklist && (
            <div className="modal-overlay" onClick={() => setShowChecklist(false)}>
              <div className="modal-content u-container" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setShowChecklist(false)}>✕</button>
                <DsbChecklist 
                  inventoryByCategory={stats.inventoryByCategory || {}}
                  totalPersons={stats.totalPersons || 1}
                />
              </div>
            </div>
          )}

          {showPreparednessModal && preparednessHousehold && (
            <div className="modal-overlay" onClick={() => setShowPreparednessModal(false)}>
              <div className="modal-content u-container" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setShowPreparednessModal(false)}>✕</button>
                <h2>Preparedness — {preparednessHousehold.name}</h2>
                <DsbChecklist 
                  inventoryByCategory={preparednessStats.inventoryByCategory || {}}
                  totalPersons={preparednessStats.totalPersons || 1}
                />
              </div>
            </div>
          )}

          {showSettings && (
            <Settings onClose={() => setShowSettings(false)} />
          )}

                {showHouseholdManagement && (
            <HouseholdManagement
              currentHousehold={currentHousehold}
              households={households}
              onSelectHousehold={selectHousehold}
              onCreateHousehold={createNewHousehold}
              onRenameHousehold={renameHousehold}
              onDeleteHousehold={deleteHousehold}
              onClose={() => setShowHouseholdManagement(false)}
              onInviteMember={inviteMember}
              onRemoveMember={removeMember}
              onSettingsSaved={loadStats}
              isLoading={householdLoading}
            />
          )}
        </>
      )}
      </div>
    </ConflictModalProvider>
  )
}
