import Link from 'next/link';

export const metadata = {
  title: 'Resources',
  description: 'Practical guides for debt payoff planning, interest tracking, and repayment discipline.',
};

const guides = [
  {
    title: 'Highest-Rate First Payoff',
    summary: 'Rank debts by monthly interest rate so every extra rupee cuts the fastest-growing balance first.',
  },
  {
    title: 'Interest vs Principal Logging',
    summary: 'Record interest and principal separately so unpaid interest never hides inside the outstanding total.',
  },
  {
    title: 'Family Lending Hygiene',
    summary: 'Keep informal loans with clear start dates, rates, and notes so relationships stay intact.',
  },
  {
    title: 'Monthly Rate Change Checklist',
    summary: 'When a lender changes the rate, log the effective month immediately so history stays accurate.',
  },
  {
    title: 'Target Date Discipline',
    summary: 'Set a clearance target per debt and review urgency weekly instead of waiting for pressure.',
  },
  {
    title: 'Export Before Big Decisions',
    summary: 'Download your Excel snapshot before refinancing, settlement talks, or account deletion.',
  },
];

export default function ResourcesPage() {
  return (
    <main className="legal-wrap">
      <h1>Resources</h1>
      <p>
        Explore practical, implementation-focused guides for debt clarity.
        These resources are designed to help you build habits, not chase noise.
      </p>

      <section className="resource-list">
        {guides.map((guide) => (
          <article key={guide.title} className="resource-card">
            <h2>{guide.title}</h2>
            <p>{guide.summary}</p>
          </article>
        ))}
      </section>

      <h2>How to use these resources with the app</h2>
      <p>1. Add every active debt with accurate principal and monthly rate.</p>
      <p>2. Log payments as they happen and review the home urgency board weekly.</p>
      <p>3. Enable MFA, keep a recovery key, and export before major account changes.</p>

      <h2>Scope reminder</h2>
      <p>
        These materials are educational and operational in nature. They are not lending advice or
        product recommendations.
      </p>

      <p className="legal-links">
        Need product details? Visit <Link href="/about">About</Link>. For policy and data handling,
        review <Link href="/privacy"> Privacy Policy</Link> and <Link href="/terms"> Terms</Link>.
      </p>
    </main>
  );
}
