// Dashboard HTML template - inlined for Cloudflare Workers
import { transactionTypeMappings } from './config/transaction-type-mappings';

// Inject mappings as JSON for use in browser
const mappingsJSON = JSON.stringify(
  transactionTypeMappings.reduce((acc, m) => {
    acc[m.slug] = m.display;
    return acc;
  }, {} as Record<string, string>)
);

export const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wealth Management Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', monospace;
      background: #f5f5f5;
      color: #333;
      font-size: 15px;
    }
    .app-shell { display: flex; min-height: 100vh; }
    .sidebar {
      width: 250px;
      background: #1a1a1a;
      color: white;
      padding: 20px;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar h1 {
      font-size: 20px;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #333;
    }
    .nav-menu { list-style: none; }
    .nav-item { margin-bottom: 10px; }
    .nav-link {
      display: block;
      padding: 10px 15px;
      color: #ccc;
      text-decoration: none;
      border-radius: 5px;
      transition: all 0.2s;
    }
    .nav-link:hover, .nav-link.active {
      background: #333;
      color: white;
    }
    .main-content {
      margin-left: 250px;
      flex: 1;
      padding: 30px;
    }
    .header { margin-bottom: 30px; }
    .header h2 {
      font-size: 28px;
      margin-bottom: 5px;
    }
    .header p {
      color: #666;
      font-size: 14px;
    }
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card-title {
      font-size: 11px;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .card-value {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .card-value.positive { color: #10b981; }
    .card-value.negative { color: #ef4444; }
    .card-subtitle {
      font-size: 11px;
      color: #999;
    }
    .widget {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .widget-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .widget-title {
      font-size: 18px;
      font-weight: 600;
    }
    .widget-link {
      color: #3b82f6;
      text-decoration: none;
      font-size: 14px;
    }
    .transactions-table {
      width: 100%;
      border-collapse: collapse;
    }
    .transactions-table th {
      text-align: left;
      padding: 10px;
      border-bottom: 2px solid #eee;
      font-size: 15px;
      color: #666;
      font-weight: 600;
    }
    .transactions-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #f5f5f5;
      font-size: 16px;
    }
    .transactions-table tr:hover { background: #fafafa; }
    .clickable-row {
      cursor: pointer;
      transition: background 0.2s;
    }
    .clickable-row:hover {
      background: #f0f9ff !important;
    }
    .filter-bar {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .filter-bar select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      min-width: 200px;
    }
    .filter-bar button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: #6b7280;
      color: white;
      font-size: 13px;
      cursor: pointer;
    }
    .filter-bar button:hover {
      background: #4b5563;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 500;
    }
    .badge.income-distribution {
      background: #dcfce7;
      color: #166534;
    }
    .badge.withdrawal {
      background: #dbeafe;
      color: #1e40af;
    }
    .badge.deposit {
      background: #fee2e2;
      color: #991b1b;
    }
    .badge.management-fee {
      background: #fef3c7;
      color: #92400e;
    }
    .badge.unrealized-gain-loss {
      background: #f3e8ff;
      color: #6b21a8;
    }
    .amount { font-variant-numeric: tabular-nums; }
    .amount.positive { color: #10b981; }
    .amount.negative { color: #ef4444; }
    .commitment-progress {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .progress-bar {
      flex: 1;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      min-width: 80px;
    }
    .progress-fill {
      height: 100%;
      background: #3b82f6;
      transition: width 0.3s ease;
    }
    .progress-fill.complete {
      background: #10b981;
    }
    .commitment-text {
      font-size: 12px;
      color: #666;
      white-space: nowrap;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: #999;
    }
    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    .upload-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 60px 20px;
      text-align: center;
      background: #fafafa;
      cursor: pointer;
      transition: all 0.2s;
    }
    .upload-zone:hover, .upload-zone.dragover {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    .upload-zone input[type="file"] { display: none; }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover { background: #2563eb; }
    .btn-primary:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #6b7280;
      color: white;
    }
    .btn-secondary:hover { background: #4b5563; }
    .btn-small {
      padding: 5px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      background: #3b82f6;
      color: white;
    }
    .btn-small:hover { background: #2563eb; }
    .btn-danger {
      background: #e74c3c;
      color: white;
    }
    .btn-danger:hover { background: #c0392b; }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal {
      background: white;
      border-radius: 8px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .modal h3 {
      margin-bottom: 20px;
      font-size: 20px;
    }
    .wizard-steps {
      display: flex;
      gap: 10px;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #eee;
    }
    .wizard-step {
      flex: 1;
      padding: 10px;
      text-align: center;
      border-radius: 5px;
      background: #f5f5f5;
      font-size: 13px;
      color: #666;
    }
    .wizard-step.active {
      background: #3b82f6;
      color: white;
      font-weight: 600;
    }
    .wizard-step.completed {
      background: #10b981;
      color: white;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-size: 14px;
      font-weight: 500;
    }
    .form-group select, .form-group input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 14px;
    }
    .column-mapping-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .column-mapping-table th, .column-mapping-table td {
      padding: 10px;
      border: 1px solid #eee;
      text-align: left;
    }
    .column-mapping-table th {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 13px;
    }
    .preview-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .preview-stat {
      background: white;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid #eee;
    }
    .preview-stat-value {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .preview-stat-label {
      font-size: 13px;
      color: #666;
    }
    .success {
      background: #d1fae5;
      color: #065f46;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    // Transaction type mappings from server
    const TRANSACTION_TYPE_DISPLAY = ${mappingsJSON};

    const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));

    const formatNumber = (amount) => new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));

    const getCurrencySymbol = (currency) => {
      const symbols = {
        'USD': '$',
        'ILS': '₪',
        'EUR': '€',
        'GBP': '£',
        '$': '$',
      };
      return symbols[currency] || '';
    };

    const getTransactionTypeDisplay = (slug) => TRANSACTION_TYPE_DISPLAY[slug] || slug;

    const formatDate = (dateStr) => new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateStr));

    function Sidebar({ currentPage, onNavigate }) {
      return (
        <div className="sidebar">
          <h1>💼 Wealth Manager</h1>
          <ul className="nav-menu">
            <li className="nav-item">
              <a href="#" className={'nav-link ' + (currentPage === 'dashboard' ? 'active' : '')}
                onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}>
                📊 Dashboard
              </a>
            </li>
            <li className="nav-item">
              <a href="#" className={'nav-link ' + (currentPage === 'transactions' ? 'active' : '')}
                onClick={(e) => { e.preventDefault(); onNavigate('transactions'); }}>
                💸 Transactions
              </a>
            </li>
            <li className="nav-item">
              <a href="#" className={'nav-link ' + (currentPage === 'investments' ? 'active' : '')}
                onClick={(e) => { e.preventDefault(); onNavigate('investments'); }}>
                🏦 Investments
              </a>
            </li>
            <li className="nav-item">
              <a href="#" className={'nav-link ' + (currentPage === 'upload' ? 'active' : '')}
                onClick={(e) => { e.preventDefault(); onNavigate('upload'); }}>
                📤 Upload
              </a>
            </li>
          </ul>
        </div>
      );
    }

    function MetricCard({ title, value, subtitle, type }) {
      return (
        <div className="card">
          <div className="card-title">{title}</div>
          <div className={'card-value ' + (type || '')}>{value}</div>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
      );
    }

    function Dashboard() {
      const [loading, setLoading] = useState(true);
      const [data, setData] = useState(null);

      useEffect(() => {
        fetch('/api/reports/dashboard')
          .then(res => res.json())
          .then(result => {
            if (result.success) setData(result.data);
            setLoading(false);
          });
      }, []);

      if (loading) return <div className="loading">Loading...</div>;
      if (!data) return <div className="error">Failed to load data</div>;

      const { overview, recent_transactions, open_commitments } = data;

      const netPositionSubtitle = 'Called ' + formatCurrency(overview.total_called) +
        ' - Distributed ' + formatCurrency(overview.total_distributed) +
        ' (Capital ' + formatCurrency(overview.capital_returned) +
        ' + Income ' + formatCurrency(overview.income_distributed) + ')';

      const stockSubtitle = 'Deposits ' + formatCurrency(overview.stock_deposits) +
        ' - Withdrawals ' + formatCurrency(overview.stock_distributions);

      const commitmentsSubtitle = open_commitments && open_commitments.count > 0
        ? open_commitments.count + ' open commitment' + (open_commitments.count !== 1 ? 's' : '') +
          ' • Called ' + formatCurrency(open_commitments.total_called_usd)
        : 'No open commitments';

      return (
        <>
          <div className="header">
            <h2>Dashboard</h2>
            <p>Portfolio overview and recent activity</p>
          </div>
          <div className="dashboard-grid">
            <MetricCard title="Net Position" value={formatCurrency(overview.net_position)}
              subtitle={netPositionSubtitle}
              type={overview.net_position >= 0 ? 'negative' : 'positive'} />
            <MetricCard title="Stock Portfolios Net" value={formatCurrency(overview.stock_net_position)}
              subtitle={stockSubtitle} />
            {open_commitments && open_commitments.count > 0 && (
              <MetricCard title="Open Commitments"
                value={formatCurrency(open_commitments.total_remaining_usd)}
                subtitle={commitmentsSubtitle}
                type="negative" />
            )}
          </div>
          <div className="widget">
            <div className="widget-header">
              <h3 className="widget-title">Recent Transactions</h3>
            </div>
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Investment</th>
                  <th>Type</th>
                  <th style={{textAlign:'right'}}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent_transactions.slice(0, 10).map((tx, i) => (
                  <tr key={i}>
                    <td>{formatDate(tx.date)}</td>
                    <td>{tx.investment_name || tx.counterparty}</td>
                    <td><span className={'badge ' + tx.transaction_category}>{getTransactionTypeDisplay(tx.transaction_category)}</span></td>
                    <td style={{textAlign:'right'}}>
                      <span className={'amount ' + (tx.cash_flow_direction > 0 ? 'positive' : 'negative')}>
                        {tx.cash_flow_direction < 0 ? '-' : ''}{getCurrencySymbol(tx.original_currency)}{formatNumber(tx.amount_original)} {tx.original_currency}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    function TransactionsPage({ filterInvestmentId = null }) {
      const [loading, setLoading] = useState(true);
      const [transactions, setTransactions] = useState([]);
      const [investments, setInvestments] = useState([]);
      const [selectedInvestmentId, setSelectedInvestmentId] = useState(filterInvestmentId);
      const [editingTransaction, setEditingTransaction] = useState(null);
      const [deletingTransaction, setDeletingTransaction] = useState(null);

      const loadTransactions = () => {
        setLoading(true);
        const url = selectedInvestmentId
          ? '/api/reports/transactions?pageSize=1000&investment_id=' + selectedInvestmentId
          : '/api/reports/transactions?pageSize=1000';
        fetch(url)
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              setTransactions(result.data.items);
            }
            setLoading(false);
          });
      };

      const loadInvestments = () => {
        fetch('/api/configure/investments-list')
          .then(res => res.json())
          .then(result => {
            if (result.success) setInvestments(result.data);
          });
      };

      useEffect(() => {
        loadInvestments();
      }, []);

      useEffect(() => {
        setSelectedInvestmentId(filterInvestmentId);
      }, [filterInvestmentId]);

      useEffect(() => {
        loadTransactions();
      }, [selectedInvestmentId]);

      const handleEdit = (transaction) => {
        setEditingTransaction({...transaction});
      };

      const handleSaveEdit = async () => {
        try {
          const response = await fetch(\`/api/transactions/\${editingTransaction.id}\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: editingTransaction.date,
              amount_original: parseFloat(editingTransaction.amount_original),
              transaction_category: editingTransaction.transaction_category,
            }),
          });
          const result = await response.json();
          if (result.success) {
            setEditingTransaction(null);
            loadTransactions();
          } else {
            alert('Failed to update transaction: ' + result.message);
          }
        } catch (error) {
          alert('Error updating transaction: ' + error.message);
        }
      };

      const handleDelete = async () => {
        try {
          const response = await fetch(\`/api/transactions/\${deletingTransaction.id}\`, {
            method: 'DELETE',
          });
          const result = await response.json();
          if (result.success) {
            setDeletingTransaction(null);
            loadTransactions();
          } else {
            alert('Failed to delete transaction: ' + result.message);
          }
        } catch (error) {
          alert('Error deleting transaction: ' + error.message);
        }
      };

      if (loading) return <div className="loading">Loading...</div>;

      const selectedInvestment = selectedInvestmentId
        ? investments.find(inv => inv.id === parseInt(selectedInvestmentId))
        : null;

      return (
        <>
          <div className="header">
            <h2>Transactions</h2>
            <p>{transactions.length} transactions{selectedInvestment ? ' for ' + selectedInvestment.name : ''}</p>
          </div>
          <div className="filter-bar">
            <select
              value={selectedInvestmentId || ''}
              onChange={(e) => setSelectedInvestmentId(e.target.value)}
            >
              <option value="">All Investments</option>
              {investments.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.name}</option>
              ))}
            </select>
            {selectedInvestmentId && (
              <button onClick={() => setSelectedInvestmentId(null)}>Clear Filter</button>
            )}
          </div>
          <div className="widget">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Investment</th>
                  <th>Type</th>
                  <th style={{textAlign:'right'}}>Amount</th>
                  <th style={{width: '120px'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr key={i}>
                    <td>{formatDate(tx.date)}</td>
                    <td>{tx.investment_name || '-'}</td>
                    <td><span className={'badge ' + tx.transaction_category}>{getTransactionTypeDisplay(tx.transaction_category)}</span></td>
                    <td style={{textAlign:'right'}}>
                      <span className={'amount ' + (tx.cash_flow_direction > 0 ? 'positive' : 'negative')}>
                        {tx.cash_flow_direction < 0 ? '-' : ''}{getCurrencySymbol(tx.original_currency)}{formatNumber(tx.amount_original)} {tx.original_currency}
                      </span>
                    </td>
                    <td>
                      <button className="btn-small" onClick={() => handleEdit(tx)} style={{marginRight:'5px'}}>Edit</button>
                      <button className="btn-small btn-danger" onClick={() => setDeletingTransaction(tx)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit Modal */}
          {editingTransaction && (
            <div className="modal-overlay" onClick={() => setEditingTransaction(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Edit Transaction</h3>
                <div style={{marginBottom:'15px'}}>
                  <label style={{display:'block',marginBottom:'5px'}}>Date:</label>
                  <input
                    type="date"
                    value={editingTransaction.date}
                    onChange={(e) => setEditingTransaction({...editingTransaction, date: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                  />
                </div>
                <div style={{marginBottom:'15px'}}>
                  <label style={{display:'block',marginBottom:'5px'}}>Amount:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingTransaction.amount_original}
                    onChange={(e) => setEditingTransaction({...editingTransaction, amount_original: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                  />
                </div>
                <div style={{marginBottom:'15px'}}>
                  <label style={{display:'block',marginBottom:'5px'}}>Category:</label>
                  <select
                    value={editingTransaction.transaction_category}
                    onChange={(e) => setEditingTransaction({...editingTransaction, transaction_category: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                  >
                    {Object.entries(TRANSACTION_TYPE_DISPLAY).map(([slug, display]) => (
                      <option key={slug} value={slug}>{display}</option>
                    ))}
                  </select>
                </div>
                <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                  <button className="btn" onClick={() => setEditingTransaction(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveEdit}>Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deletingTransaction && (
            <div className="modal-overlay" onClick={() => setDeletingTransaction(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Delete Transaction</h3>
                <p>Are you sure you want to delete this transaction?</p>
                <p style={{fontSize:'13px',color:'#666'}}>
                  <strong>Investment:</strong> {deletingTransaction.investment_name}<br/>
                  <strong>Date:</strong> {formatDate(deletingTransaction.date)}<br/>
                  <strong>Amount:</strong> {getCurrencySymbol(deletingTransaction.original_currency)}{formatNumber(deletingTransaction.amount_original)} {deletingTransaction.original_currency}
                </p>
                <p style={{color:'#e74c3c',fontSize:'13px'}}>This action cannot be undone.</p>
                <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'20px'}}>
                  <button className="btn" onClick={() => setDeletingTransaction(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    // Upload Page with Two-Phase Import
    function UploadPage() {
      const [step, setStep] = useState('upload'); // upload, discovery, importing, success
      const [file, setFile] = useState(null);
      const [dragOver, setDragOver] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);

      // Step data for two-phase import
      const [discoveryResult, setDiscoveryResult] = useState(null);
      const [importResult, setImportResult] = useState(null);

      const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.match(/\.csv$/i)) {
          setFile(droppedFile);
          setError(null);
        } else {
          setError('Please upload a valid CSV file (.csv)');
        }
      };

      const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
          setFile(selectedFile);
          setError(null);
        }
      };

      const discoverInvestments = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await fetch('/api/upload/discover-investments', {
            method: 'POST',
            body: formData,
          });
          const result = await response.json();
          console.log('[DEBUG] Discovery API response:', result);

          if (result.success) {
            console.log('[DEBUG] Setting discovery result:', result.data);
            setDiscoveryResult(result.data);
            console.log('[DEBUG] Setting step to discovery');
            setStep('discovery');
          } else {
            setError(result.message || 'Failed to discover investments');
          }
        } catch (err) {
          setError('Failed to discover investments: ' + err.message);
        } finally {
          setLoading(false);
        }
      };

      const createNewInvestments = async () => {
        if (!discoveryResult || discoveryResult.newInvestments.length === 0) {
          // No new investments, proceed directly to import
          await importTransactions();
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const response = await fetch('/api/upload/create-investments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ investments: discoveryResult.newInvestments }),
          });
          const result = await response.json();

          if (result.success) {
            // After creating investments, import transactions
            await importTransactions();
          } else {
            setError(result.message || 'Failed to create investments');
            setLoading(false);
          }
        } catch (err) {
          setError('Failed to create investments: ' + err.message);
          setLoading(false);
        }
      };

      const clearTables = async () => {
        if (!confirm('Are you sure you want to clear all transactions and investments? This cannot be undone.')) {
          return;
        }
        setLoading(true);
        setError(null);

        try {
          const response = await fetch('/api/upload/clear-tables', {
            method: 'POST',
          });
          const result = await response.json();

          if (result.success) {
            setFile(null);
            setStep('upload');
            setDiscoveryResult(null);
            setImportResult(null);
          } else {
            setError(result.message || 'Failed to clear tables');
          }
        } catch (err) {
          setError('Failed to clear tables: ' + err.message);
        } finally {
          setLoading(false);
        }
      };

      const importTransactions = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setStep('importing');

        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await fetch('/api/upload/import-transactions', {
            method: 'POST',
            body: formData,
          });
          const result = await response.json();

          if (result.success) {
            setImportResult(result.data);
            setStep('success');
          } else {
            setError(result.message || 'Failed to import transactions');
          }
        } catch (err) {
          setError('Failed to import transactions: ' + err.message);
        } finally {
          setLoading(false);
        }
      };

      if (step === 'upload') {
        return (
          <>
            <div className="header" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                <h2>Upload Transactions</h2>
                <p>Upload a CSV file to import transactions</p>
              </div>
              <button className="btn btn-danger" onClick={clearTables} disabled={loading} style={{marginTop:'10px'}}>
                Clear All Data
              </button>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="widget">
              <div
                className={'upload-zone' + (dragOver ? ' dragover' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input').click()}
              >
                <input
                  type="file"
                  id="file-input"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                />
                {!file && <>
                  <div style={{fontSize: '48px', marginBottom: '20px'}}>📄</div>
                  <div style={{fontSize: '18px', marginBottom: '10px'}}>
                    Drop CSV file here or click to browse
                  </div>
                  <div style={{fontSize: '14px', color: '#999'}}>
                    Supported format: .csv
                  </div>
                </>}
                {file && <>
                  <div style={{fontSize: '48px', marginBottom: '20px'}}>✓</div>
                  <div style={{fontSize: '18px', marginBottom: '10px'}}>
                    {file.name}
                  </div>
                  <div style={{fontSize: '14px', color: '#999'}}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </>}
              </div>

              {file && (
                <div style={{marginTop: '20px', textAlign: 'center'}}>
                  <button className="btn btn-primary" onClick={discoverInvestments} disabled={loading}>
                    {loading ? 'Analyzing...' : 'Analyze File'}
                  </button>
                </div>
              )}
            </div>
          </>
        );
      }

      if (step === 'discovery') {
        if (!discoveryResult) return null;

        const { existingInvestments, newInvestments, stats } = discoveryResult;

        return (
          <>
            <div className="header">
              <h2>Investment Discovery</h2>
              <p>Found {stats.existing + stats.new} unique investments in file</p>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="dashboard-grid">
              <div className="card">
                <div className="card-title">Existing Investments</div>
                <div className="card-value" style={{color: '#10b981'}}>{stats.existing}</div>
                <div className="card-subtitle">Already in system</div>
              </div>
              <div className="card">
                <div className="card-title">New Investments</div>
                <div className="card-value" style={{color: '#3b82f6'}}>{stats.new}</div>
                <div className="card-subtitle">Will be created</div>
              </div>
            </div>

            {existingInvestments.length > 0 && (
              <div className="widget">
                <h3 style={{marginBottom: '15px'}}>Existing Investments ({existingInvestments.length})</h3>
                <table className="column-mapping-table">
                  <thead>
                    <tr>
                      <th>Investment Name</th>
                      <th>Counterparty</th>
                      <th>Product Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingInvestments.map((inv, i) => (
                      <tr key={i}>
                        <td><strong>{inv.name}</strong></td>
                        <td>{inv.counterparty}</td>
                        <td style={{fontSize:'12px',color:'#666'}}>{inv.productType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {newInvestments.length > 0 && (
              <div className="widget">
                <h3 style={{marginBottom: '15px'}}>New Investments ({newInvestments.length})</h3>
                <table className="column-mapping-table">
                  <thead>
                    <tr>
                      <th>Investment Name</th>
                      <th>Counterparty</th>
                      <th>Product Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newInvestments.map((inv, i) => (
                      <tr key={i}>
                        <td><strong>{inv.name}</strong></td>
                        <td>{inv.counterparty}</td>
                        <td style={{fontSize:'12px',color:'#666'}}>{inv.productType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="widget">
              <div style={{marginTop: '20px', textAlign: 'right'}}>
                <button className="btn btn-secondary" style={{marginRight:'10px'}} onClick={() => setStep('upload')}>
                  ← Cancel
                </button>
                <button className="btn btn-primary" onClick={createNewInvestments} disabled={loading}>
                  {loading ? 'Importing...' : 'Import Transactions →'}
                </button>
              </div>
            </div>
          </>
        );
      }

      if (step === 'importing') {
        return (
          <>
            <div className="header">
              <h2>Importing Transactions...</h2>
              <p>Please wait while we process your file</p>
            </div>

            <div className="widget">
              <div style={{textAlign: 'center', padding: '40px'}}>
                <div style={{fontSize: '48px', marginBottom: '20px'}}>⏳</div>
                <div style={{fontSize: '18px', color: '#666'}}>Processing transactions...</div>
              </div>
            </div>
          </>
        );
      }

      if (step === 'success') {
        const result = importResult || {};

        return (
          <>
            <div className="header">
              <h2>Import Complete!</h2>
              <p>Transactions imported successfully</p>
            </div>

            <div className="success">
              <div style={{fontSize: '48px', textAlign: 'center', marginBottom: '20px'}}>✓</div>
              <div style={{textAlign: 'center', marginBottom: '30px'}}>
                <strong>Success!</strong> Your transactions have been imported.
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="card">
                <div className="card-title">Imported</div>
                <div className="card-value" style={{color: '#10b981'}}>{result.imported || 0}</div>
                <div className="card-subtitle">Transactions added</div>
              </div>
              <div className="card">
                <div className="card-title">Skipped</div>
                <div className="card-value" style={{color: '#f59e0b'}}>{result.skipped || 0}</div>
                <div className="card-subtitle">Duplicates/errors</div>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="card">
                  <div className="card-title">Errors</div>
                  <div className="card-value" style={{color: '#ef4444'}}>{result.errors.length}</div>
                  <div className="card-subtitle">Issues found</div>
                </div>
              )}
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="widget">
                <h3 style={{marginBottom: '15px'}}>Import Errors</h3>
                <table className="column-mapping-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.slice(0, 10).map((err, i) => (
                      <tr key={i}>
                        <td><strong>{err.row}</strong></td>
                        <td style={{fontSize:'12px',color:'#666'}}>{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.errors.length > 10 && (
                  <div style={{marginTop: '10px', fontSize: '12px', color: '#666'}}>
                    ... and {result.errors.length - 10} more errors
                  </div>
                )}
              </div>
            )}

            <div style={{textAlign: 'center', marginTop: '30px'}}>
              <button className="btn btn-primary" onClick={() => {
                setStep('upload');
                setFile(null);
                setDiscoveryResult(null);
                setImportResult(null);
                setError(null);
              }}>
                Upload Another File
              </button>
            </div>
          </>
        );
      }

      return null;
    }

    function InvestmentsPage({ onNavigate }) {
      const [loading, setLoading] = useState(true);
      const [investments, setInvestments] = useState([]);
      const [editingInvestment, setEditingInvestment] = useState(null);
      const [deletingInvestment, setDeletingInvestment] = useState(null);

      const handleRowClick = (investmentId) => {
        onNavigate('transactions', investmentId);
      };

      const loadInvestments = () => {
        setLoading(true);
        fetch('/api/configure/investments-list')
          .then(res => res.json())
          .then(result => {
            if (result.success) setInvestments(result.data);
            setLoading(false);
          });
      };

      useEffect(() => {
        loadInvestments();
      }, []);

      const handleEdit = (investment) => {
        setEditingInvestment({...investment});
      };

      const handleSaveEdit = async () => {
        try {
          const response = await fetch(\`/api/configure/investments/\${editingInvestment.id}\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: editingInvestment.name,
              product_type: editingInvestment.product_type,
              investment_group: editingInvestment.investment_group,
              status: editingInvestment.status,
              initial_commitment: editingInvestment.initial_commitment,
              committed_currency: editingInvestment.committed_currency,
              commitment_date: editingInvestment.commitment_date,
              // commitment_amount_usd is now calculated automatically by the backend
              phase: editingInvestment.phase,
              manual_phase: editingInvestment.manual_phase,
              commitment_notes: editingInvestment.commitment_notes,
            }),
          });
          const result = await response.json();
          if (result.success) {
            setEditingInvestment(null);
            loadInvestments();
          } else {
            alert('Failed to update investment: ' + result.message);
          }
        } catch (error) {
          alert('Error updating investment: ' + error.message);
        }
      };

      const handleDelete = async () => {
        try {
          const response = await fetch(\`/api/configure/investments/\${deletingInvestment.id}\`, {
            method: 'DELETE',
          });
          const result = await response.json();
          if (result.success) {
            setDeletingInvestment(null);
            loadInvestments();
          } else {
            alert('Failed to delete investment: ' + result.message);
          }
        } catch (error) {
          alert('Error deleting investment: ' + error.message);
        }
      };

      if (loading) return <div className="loading">Loading...</div>;

      return (
        <>
          <div className="header">
            <h2>Investments</h2>
            <p>{investments.length} investments</p>
          </div>
          <div className="widget">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Type</th>
                  <th>Commitment</th>
                  <th>Status</th>
                  <th style={{width: '120px'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((inv, i) => (
                  <tr key={i} className="clickable-row" onClick={() => handleRowClick(inv.id)}>
                    <td><strong>{inv.name}</strong></td>
                    <td style={{fontFamily:'monospace',fontSize:'12px',color:'#666'}}>{inv.slug || '-'}</td>
                    <td>{inv.product_type || '-'}</td>
                    <td>
                      {inv.initial_commitment && inv.committed_currency ? (
                        <div className="commitment-progress">
                          <div className="progress-bar">
                            <div
                              className={'progress-fill' + ((inv.called_to_date || 0) >= inv.initial_commitment ? ' complete' : '')}
                              style={{width: Math.min(100, ((inv.called_to_date || 0) / inv.initial_commitment) * 100) + '%'}}
                            />
                          </div>
                          <span className="commitment-text">
                            {formatNumber(inv.remaining || inv.initial_commitment)} {inv.committed_currency}
                          </span>
                        </div>
                      ) : '-'}
                    </td>
                    <td><span className="badge">{inv.status}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn-small" onClick={() => handleEdit(inv)} style={{marginRight:'5px'}}>Edit</button>
                      <button className="btn-small btn-danger" onClick={() => setDeletingInvestment(inv)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit Modal */}
          {editingInvestment && (
            <div className="modal-overlay" onClick={() => setEditingInvestment(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:'600px'}}>
                <h3>Edit Investment</h3>

                <div style={{marginBottom:'20px',paddingBottom:'15px',borderBottom:'1px solid #eee'}}>
                  <h4 style={{fontSize:'14px',fontWeight:'600',marginBottom:'10px',color:'#666'}}>Basic Information</h4>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Name:</label>
                    <input
                      type="text"
                      value={editingInvestment.name}
                      onChange={(e) => setEditingInvestment({...editingInvestment, name: e.target.value})}
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                    />
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Product Type:</label>
                    <input
                      type="text"
                      value={editingInvestment.product_type || ''}
                      onChange={(e) => setEditingInvestment({...editingInvestment, product_type: e.target.value})}
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                    />
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Investment Group:</label>
                    <input
                      type="text"
                      value={editingInvestment.investment_group || ''}
                      onChange={(e) => setEditingInvestment({...editingInvestment, investment_group: e.target.value})}
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                    />
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Status:</label>
                    <select
                      value={editingInvestment.status}
                      onChange={(e) => setEditingInvestment({...editingInvestment, status: e.target.value})}
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                <div style={{marginBottom:'20px',paddingBottom:'15px',borderBottom:'1px solid #eee'}}>
                  <h4 style={{fontSize:'14px',fontWeight:'600',marginBottom:'10px',color:'#666'}}>Commitment Details</h4>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'15px',marginBottom:'15px'}}>
                    <div>
                      <label style={{display:'block',marginBottom:'5px'}}>Commitment Amount:</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingInvestment.initial_commitment || ''}
                        onChange={(e) => setEditingInvestment({...editingInvestment, initial_commitment: parseFloat(e.target.value) || null})}
                        style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                      />
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:'5px'}}>Currency:</label>
                      <input
                        type="text"
                        value={editingInvestment.committed_currency || ''}
                        onChange={(e) => setEditingInvestment({...editingInvestment, committed_currency: e.target.value})}
                        placeholder="USD, ILS, EUR..."
                        style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                      />
                    </div>
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Commitment Date:</label>
                    <input
                      type="date"
                      value={editingInvestment.commitment_date || ''}
                      onChange={(e) => setEditingInvestment({...editingInvestment, commitment_date: e.target.value})}
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                    />
                  </div>
                  <div style={{marginBottom:'15px',padding:'10px',background:'#f0f9ff',borderRadius:'4px',fontSize:'13px',color:'#666'}}>
                    <strong>Note:</strong> USD value will be calculated automatically based on the commitment amount, currency, and date.
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Phase:</label>
                    <select
                      value={editingInvestment.phase || ''}
                      onChange={(e) => setEditingInvestment({...editingInvestment, phase: e.target.value})}
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px'}}
                    >
                      <option value="">Auto-detect</option>
                      <option value="building_up">Building Up</option>
                      <option value="stable">Stable</option>
                      <option value="drawing_down">Drawing Down</option>
                    </select>
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <input
                        type="checkbox"
                        checked={editingInvestment.manual_phase || false}
                        onChange={(e) => setEditingInvestment({...editingInvestment, manual_phase: e.target.checked ? 1 : 0})}
                      />
                      <span>Manual phase override (prevent auto-detection)</span>
                    </label>
                  </div>
                  <div style={{marginBottom:'15px'}}>
                    <label style={{display:'block',marginBottom:'5px'}}>Notes:</label>
                    <textarea
                      value={editingInvestment.commitment_notes || ''}
                      onChange={(e) => setEditingInvestment({...editingInvestment, commitment_notes: e.target.value})}
                      rows="3"
                      style={{width:'100%',padding:'8px',border:'1px solid #ddd',borderRadius:'4px',fontFamily:'inherit'}}
                    />
                  </div>
                </div>

                <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                  <button className="btn" onClick={() => setEditingInvestment(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveEdit}>Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deletingInvestment && (
            <div className="modal-overlay" onClick={() => setDeletingInvestment(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Delete Investment</h3>
                <p>Are you sure you want to delete <strong>{deletingInvestment.name}</strong>?</p>
                <p style={{color:'#e74c3c',fontSize:'13px'}}>This action cannot be undone. Note: Investments with transactions cannot be deleted.</p>
                <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'20px'}}>
                  <button className="btn" onClick={() => setDeletingInvestment(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    function App() {
      const [currentPage, setCurrentPage] = useState('dashboard');
      const [filterInvestmentId, setFilterInvestmentId] = useState(null);

      const handleNavigate = (page, investmentId = null) => {
        setCurrentPage(page);
        setFilterInvestmentId(investmentId);
      };

      let content;
      if (currentPage === 'transactions') content = <TransactionsPage filterInvestmentId={filterInvestmentId} />;
      else if (currentPage === 'investments') content = <InvestmentsPage onNavigate={handleNavigate} />;
      else if (currentPage === 'upload') content = <UploadPage />;
      else content = <Dashboard />;

      return (
        <div className="app-shell">
          <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />
          <div className="main-content">{content}</div>
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>`;
