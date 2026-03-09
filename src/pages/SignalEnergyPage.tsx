import { Link } from 'react-router-dom'
import '../App.css'

function SignalEnergyPage() {
  return (
    <div className="app">
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem 1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Energia (SignalEnergy)</h1>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.9rem' }} aria-label="Painéis">
          <Link to="/" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Cenário Econômico (SignalEconomics)
          </Link>
          <Link to="/varejo" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Varejo (SignalRetail)
          </Link>
          <Link to="/agro" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Agronegócio (SignalAgro)
          </Link>
          <Link to="/industria" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Indústria (SignalIndustry)
          </Link>
        </nav>
      </header>

      <section className="chartSection">
        <h2>Estrutura inicial do painel</h2>
        <div className="card">
          <h3>Status</h3>
          <div className="value">Em breve</div>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            A estrutura do SignalEnergy está pronta. As séries e análises serão adicionadas na próxima etapa.
          </p>
        </div>
      </section>
    </div>
  )
}

export default SignalEnergyPage
