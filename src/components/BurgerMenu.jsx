import { useState } from 'react';
import { Smartphone, Plus, Settings, X, LogOut, Home } from 'lucide-react';
import { ThemeSwitcherFull } from './ThemeSwitcher';
import './BurgerMenu.css';

export default function BurgerMenu({ 
  onScanBarcode, 
  onAddManual, 
  onFieldSettings,
  onShowChecklist,
  onShowSettings,
  user,
  onLogout,
  currentHousehold,
  onShowHouseholdManagement,
  households,
  onSelectHousehold,
  onViewPreparedness
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleMenuClick = (callback) => {
    callback();
    setIsOpen(false);
  };

  const handleLogout = async () => {
    await onLogout();
    setIsOpen(false);
  };

  return (
    <>
      <button 
        className={`burger-button ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        <span className="burger-line"></span>
        <span className="burger-line"></span>
        <span className="burger-line"></span>
      </button>

      {isOpen && (
        <div 
          className="menu-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}

      <nav className={`burger-menu ${isOpen ? 'open' : ''}`}>
        {currentHousehold && (
          <>
            <div className="household-section">
              <div className="household-header">Households</div>

              {Array.isArray(households) && households.length > 0 ? (
                households.map(h => (
                  <div key={h.id} className={`household-row ${h.id === currentHousehold.id ? 'active' : ''}`}>
                    <div className="household-name-small">{h.name}</div>
                    <div className="household-actions">
                      <button className="btn-link" onClick={() => { handleMenuClick(() => onSelectHousehold(h.id)) }}>
                        Switch
                      </button>
                      <button className="btn-link" onClick={() => { handleMenuClick(() => onViewPreparedness(h)) }}>
                        View preparedness
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="household-subtitle">No households</div>
              )}

              <button 
                className="menu-item household-item"
                onClick={() => handleMenuClick(onShowHouseholdManagement)}
              >
                <Home size={40} style={{ marginRight: '0.5rem' }} />
                <div className="household-info">
                  <div className="household-name">{currentHousehold.name}</div>
                  <div className="household-subtitle">Manage household</div>
                </div>
              </button>
            </div>
            <div className="menu-divider"></div>
          </>
        )}

        <button 
          className="menu-item"
          onClick={() => handleMenuClick(onScanBarcode)}
        >
          <Smartphone size={20} style={{ marginRight: '0.5rem' }} />
          Scan Barcode
        </button>
        <button 
          className="menu-item"
          onClick={() => handleMenuClick(onAddManual)}
        >
          <Plus size={20} style={{ marginRight: '0.5rem' }} />
          Add Item Manually
        </button>
        <button 
          className="menu-item"
          onClick={() => handleMenuClick(onShowChecklist)}
        >
          <Settings size={20} style={{ marginRight: '0.5rem' }} />
          Preparedness Checklist
        </button>
        <button 
          className="menu-item"
          onClick={() => handleMenuClick(onShowSettings)}
        >
          <Settings size={20} style={{ marginRight: '0.5rem' }} />
          Settings
        </button>

        {user && (
          <>
            <div className="menu-divider"></div>
            <div className="user-section">
              <p className="user-email">{user.email}</p>
              <button 
                className="menu-item logout-item"
                onClick={handleLogout}
              >
                <LogOut size={20} style={{ marginRight: '0.5rem' }} />
                Sign Out
              </button>
            </div>
          </>
        )}

        <button 
          className="menu-item close-item"
          onClick={() => setIsOpen(false)}
        >
          <X size={20} style={{ marginRight: '0.5rem' }} />
          Close
        </button>
        
        <ThemeSwitcherFull />
      </nav>
    </>
  );
}
