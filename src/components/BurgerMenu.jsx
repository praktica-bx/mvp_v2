import { useState, useEffect } from 'react';
import { Smartphone, Plus, Settings, X, LogOut, Home, ChevronRight } from 'lucide-react';
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


  // Prevent background scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

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
        {/* Quick Actions */}
        <div className="menu-section quick-actions">
          <div className="menu-section-header">Quick Actions</div>
          <button className="menu-item" onClick={() => handleMenuClick(onScanBarcode)}>
            <Smartphone size={20} style={{ marginRight: '0.5rem' }} />
            Scan Barcode
          </button>
          <button className="menu-item" onClick={() => handleMenuClick(onAddManual)}>
            <Plus size={20} style={{ marginRight: '0.5rem' }} />
            Add Item Manually
          </button>
          <button className="menu-item disabled" aria-disabled="true">
            <Plus size={20} style={{ marginRight: '0.5rem' }} />
            Quick Inventory (coming soon)
          </button>
        </div>

        <div className="menu-divider"></div>

        {/* Households */}
        <div className="menu-section households">
          <div className="menu-section-header">Households</div>

          {currentHousehold ? (
            <>
              <div className="other-households">
                {Array.isArray(households) && households.length > 0 ? (
                  households.map(h => (
                    <div key={h.id} className={`household-row ${h.id === currentHousehold.id ? 'active' : ''}`}>
                      <button
                        className="household-name-button"
                        onClick={() => {
                          // If this is the active/selected household, open the Manage Households modal
                          if (h.id === currentHousehold.id) {
                            handleMenuClick(onShowHouseholdManagement)
                          } else {
                            handleMenuClick(() => onSelectHousehold(h.id))
                          }
                        }}
                        aria-pressed={h.id === currentHousehold.id}
                      >
                        <span className="household-name-text">{h.name}</span>
                        <ChevronRight className="household-switch-icon" size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="household-subtitle">No households</div>
                )}
              </div>

            </>
          ) : (
            <div className="household-subtitle">No household selected</div>
          )}
        </div>

        <div className="menu-divider"></div>

        {/* Preparedness & Inventory */}
        <div className="menu-section preparedness">
          <div className="menu-section-header">Preparedness & Inventory</div>
          <button className="menu-item" onClick={() => handleMenuClick(onShowChecklist)}>
            <Settings size={20} style={{ marginRight: '0.5rem' }} />
            Preparedness Checklist
          </button>
          <button className="menu-item" onClick={() => { handleMenuClick(() => onViewPreparedness(currentHousehold)) }} disabled={!currentHousehold}>
            <Settings size={20} style={{ marginRight: '0.5rem' }} />
            View Preparedness Summary
          </button>
          <button className="menu-item disabled" aria-disabled="true">
            Export / Import (coming soon)
          </button>
        </div>

        <div className="menu-divider"></div>

        {/* Account & Settings */}
        <div className="menu-section account">
          <div className="menu-section-header">Account</div>
          <button className="menu-item" onClick={() => handleMenuClick(onShowSettings)}>
            <Settings size={20} style={{ marginRight: '0.5rem' }} />
            Settings
          </button>
          {user && (
            <div className="user-section">
              <p className="user-email">{user.email}</p>
              <button className="menu-item logout-item" onClick={handleLogout}>
                <LogOut size={20} style={{ marginRight: '0.5rem' }} />
                Sign Out
              </button>
            </div>
          )}
        </div>

        <div className="menu-divider"></div>

        {/* Utilities / Help at bottom */}
        <div className="menu-bottom">
          <ThemeSwitcherFull />
          <button className="menu-item" onClick={() => setIsOpen(false)}>
            <X size={20} style={{ marginRight: '0.5rem' }} />
            Close
          </button>
        </div>
      </nav>
    </>
  );
}
