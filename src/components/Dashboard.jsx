export default function Dashboard({ stats }) {
  return (
    <div className="dashboard">
      <div className="stat-card">
        <h2>Total Items</h2>
        <p className="stat-value">{stats.totalItems}</p>
      </div>
      <div className="stat-card warning">
        <h2>Expiring Soon</h2>
        <p className="stat-value">{stats.expiringSoon}</p>
      </div>
      <div className="stat-card completeness">
        <h2>Completeness</h2>
        <p className="stat-value">{stats.completeness || 0}%</p>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${stats.completeness || 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}
