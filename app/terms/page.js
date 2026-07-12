import Link from 'next/link';

export const metadata = {
  title: 'Terms and Conditions',
  description: 'Terms for using My Debt Tracker services.',
};

export default function TermsPage() {
  return (
    <main className="legal-wrap">
      <div className="legal-headband">
        <span>Legal</span>
        <Link href="/privacy" className="legal-top-link">View Privacy</Link>
      </div>
      <h1>Terms and Conditions</h1>
      <p className="legal-meta">Last updated: 2026-07-12</p>

      <h2 className="legal-section-title">1. Service scope</h2>
      <p>
        My Debt Tracker is a personal tracking and planning application. It does not provide lending,
        credit brokerage, or regulated financial advisory services.
      </p>

      <h2 className="legal-section-title">2. No financial advice</h2>
      <p>
        Information in the app is for organization and analysis. You remain responsible for all financial decisions.
      </p>

      <h2 className="legal-section-title">3. Account responsibilities</h2>
      <p>
        You are responsible for maintaining account security (PIN, MFA, recovery key) and for activities
        performed using your account. Provide accurate information and avoid unauthorized usage.
      </p>

      <h2 className="legal-section-title">4. Acceptable use</h2>
      <p>
        You may not misuse the service, attempt unauthorized access, or interfere with system operation and security.
      </p>

      <h2 className="legal-section-title">5. Availability and changes</h2>
      <p>
        We may update, suspend, or improve features as the service evolves. Material legal changes will be reflected
        through updated policy dates and notices where required.
      </p>

      <h2 className="legal-section-title">6. Limitation of liability</h2>
      <p>
        To the extent permitted by law, we are not liable for indirect or consequential losses related to repayment
        decisions, third-party outages, or user errors.
      </p>

      <h2 className="legal-section-title">7. Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend accounts involved in abuse, fraud, or policy
        violations.
      </p>

      <p className="legal-links">
        <Link href="/privacy" className="legal-cta-link">Read Privacy Policy</Link>
      </p>
    </main>
  );
}
