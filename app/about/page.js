export const metadata = {
  title: 'About',
  description: 'Why My Debt Tracker exists, who it is for, and how the platform is built for trust.',
};

export default function AboutPage() {
  return (
    <main className="legal-wrap">
      <h1>About My Debt Tracker</h1>
      <p>
        My Debt Tracker is a practical workspace for households that want one clean view of loans,
        interest, payments, priorities, and clearance targets.
      </p>

      <h2>Why we built this</h2>
      <p>
        Most people track debt across notes, chats, and bank apps. Due dates get missed,
        rate changes are forgotten, and outstanding balances become unclear.
        My Debt Tracker brings these pieces into one dashboard so repayment stays calmer and more consistent.
      </p>

      <h2>Who it is for</h2>
      <p>
        This product is designed for everyday borrowers and families managing a mix of bank loans,
        family lending, gold loans, and informal credit who want discipline without complexity.
      </p>

      <h2>What you can do in the app</h2>
      <p>1. Add debts with principal, monthly interest rate, category, and priority.</p>
      <p>2. Log interest payments, principal repayments, top-ups, and full clearances.</p>
      <p>3. Monitor unpaid interest, monthly load, and urgency in one board.</p>
      <p>4. Use account-level security features such as MFA, recovery key, and security activity logs.</p>
      <p>5. Export your own data to Excel whenever needed.</p>

      <h2>Trust and privacy approach</h2>
      <p>
        We treat privacy and security as core product behavior, not optional features. The product includes
        authentication controls, security event tracking, and transparent legal pages so users know how data is handled.
      </p>

      <h2>Important scope note</h2>
      <p>
        My Debt Tracker is a tracking and planning tool. It does not provide lending, credit scores,
        or guaranteed payoff recommendations.
      </p>
    </main>
  );
}
