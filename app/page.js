import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

export const metadata = {
  title: 'My Debt Tracker — Clear every rupee you owe',
  description: 'Track debts, interest, payments, and payoff plans in one simple private workspace.',
};

export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect('/home');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'My Debt Tracker',
    applicationCategory: 'FinanceApplication',
    description: 'Track debts, interest schedules, and repayment progress in one place.',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
    },
  };

  return (
    <main className="landing-wrap">
      <header className="landing-top">
        <Link href="/" className="landing-brand">My Debt Tracker</Link>
        <nav className="landing-top-nav">
          <Link href="/resources">Guides</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login" className="hero-primary">Sign in</Link>
        </nav>
      </header>

      <section className="hero-grid">
        <div>
          <p className="hero-kicker">Simple debt planner for households</p>
          <h1 className="hero-title">One living board for every loan, EMI, and interest due.</h1>
          <p className="hero-sub">
            Instead of juggling notes and reminders, keep each lender, rate change, payment, and clearance
            date visible before interest quietly grows.
          </p>
          <div className="hero-cta-row">
            <Link href="/signup" className="hero-primary">Start free forever</Link>
            <Link href="/login" className="hero-secondary">I already have an account</Link>
          </div>
          <div className="hero-metrics">
            <div><strong>0</strong><span>Ad cost in private workspace</span></div>
            <div><strong>100%</strong><span>User-owned Excel export</span></div>
            <div><strong>24x7</strong><span>Access to your payoff plan</span></div>
          </div>
        </div>

        <aside className="hero-card">
          <h2>What happens after sign up</h2>
          <ul>
            <li>Add each debt with principal, monthly rate, and lender.</li>
            <li>Log interest, principal, top-ups, and full clearances.</li>
            <li>Enable MFA and recovery key in under 2 minutes.</li>
            <li>Download your full Excel snapshot anytime.</li>
          </ul>
          <div className="hero-card-badge">No lender lock-in. No forced subscriptions.</div>
        </aside>
      </section>

      <section className="feature-band">
        <article>
          <h3>Interest Clarity</h3>
          <p>See unpaid interest and monthly load per debt so you know what is quietly compounding.</p>
        </article>
        <article>
          <h3>Payoff Discipline</h3>
          <p>Priority queues and target dates make misses obvious early, so repayment stays controlled.</p>
        </article>
        <article>
          <h3>Household Ledger</h3>
          <p>Separate lenders and categories while keeping one dependable outstanding picture.</p>
        </article>
      </section>

      <section className="product-peek">
        <div className="product-peek-copy">
          <p className="peek-kicker">See the product before signup</p>
          <h2>This preview maps directly to the real home dashboard</h2>
          <p>
            Card titles and section flow below are aligned with the implemented app,
            including outstanding summary, urgency alerts, monthly interest, and recent debts.
          </p>
        </div>

        <div className="product-mock-grid">
          <article className="mock-desktop mock-home-main">
            <div className="mock-app-head">
              <span className="mock-app-pill on">Home</span>
              <span className="mock-app-pill">Debts</span>
              <span className="mock-app-pill">Account</span>
            </div>
            <div className="mock-topline">
              <span>Total outstanding</span>
              <strong>₹ 4,82,500</strong>
            </div>
            <p className="mock-subline">Including unpaid interest: ₹ 5,11,200</p>
            <div className="mock-stats">
              <div><label>Active debts</label><b>8</b></div>
              <div><label>Due this month</label><b>3</b></div>
              <div><label>Monthly interest</label><b>₹ 18.4k</b></div>
              <div><label>Cleared</label><b>2</b></div>
            </div>

            <div className="mock-section-title">Payoff progress</div>
            <div className="mock-goal-row">
              <span>Target: Clear high-rate loans first</span>
              <span>₹ 4.8L / ₹ 7.5L</span>
            </div>
            <div className="mock-progress"><i style={{ width: '64%' }} /></div>

            <div className="mock-section-title">Upcoming actions</div>
            <div className="mock-option-grid main-options">
              <div className="mock-option-card">
                <strong>Interest due window</strong>
                <small>3 debts need interest this week</small>
                <span className="mock-option-tag">Time sensitive</span>
              </div>
              <div className="mock-option-card">
                <strong>Principal push option</strong>
                <small>Cut the highest rate debt first</small>
                <span className="mock-option-tag">Payoff</span>
              </div>
              <div className="mock-option-card">
                <strong>Rate change review</strong>
                <small>2 lenders updated monthly rates</small>
                <span className="mock-option-tag">Attention</span>
              </div>
            </div>

            <div className="mock-section-title">Recent debts</div>
            <ul className="mock-list">
              <li><span>HDFC Personal Loan</span><em className="ok">EMI paid: 05 Jul</em></li>
              <li><span>Family — Uncle Ravi</span><em className="warn">Interest due: 12 Jul</em></li>
              <li><span>Gold Loan</span><em className="warn">Rate changed: 1 Jul</em></li>
            </ul>
          </article>

          <article className="mock-mobile mock-home-side">
            <header>Priority queue</header>
            <div className="mock-goals-list">
              <div className="mock-goal-item">
                <div className="mock-goal-item-head"><span>Credit card float</span><em>3.5%/mo</em></div>
                <div className="mock-progress thin"><i style={{ width: '78%' }} /></div>
              </div>
              <div className="mock-goal-item">
                <div className="mock-goal-item-head"><span>Personal loan</span><em>1.8%/mo</em></div>
                <div className="mock-progress thin"><i style={{ width: '52%' }} /></div>
              </div>
            </div>

            <header className="side-subtitle">Recent payments</header>
            <ul className="mock-side-list">
              <li><span>Principal — HDFC</span><em className="ok">₹ 15,000</em></li>
              <li><span>Interest — Uncle</span><em className="warn">Due soon</em></li>
            </ul>
          </article>
        </div>
      </section>

      <section className="story-band">
        <article>
          <h2>Designed for trust, not virality.</h2>
          <p>
            Security controls, MFA, recovery key, and audit events are built into the product journey.
            This is intentional software for debt clarity, not attention-hacking finance media.
          </p>
        </article>
      </section>

      <section className="trust-strip">
        <p>
          Privacy-first architecture. No ads inside authenticated workspace. This app is a tracking tool
          and does not provide lending or credit advice.
        </p>
      </section>

      <footer className="landing-footer">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/about">About</Link>
        <Link href="/resources">Resources</Link>
        <Link href="/contact">Contact</Link>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
