import { SectionLead } from "@/components/marketing/section-lead";

export default function ContactPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Contact</p>
        <h1>Talk to the Aionis team</h1>
        <p className="hero-copy">
          For enterprise onboarding, send your use case, rollout timeline, and current architecture constraints.
        </p>

        <div className="two-col">
          <div className="card">
            <SectionLead
              eyebrow="Inquiry form"
              title="Share your context"
              copy="We use this to scope deployment, policy, and integration recommendations."
            />
            <form className="list" action="mailto:founders@aionis.dev" method="post" encType="text/plain">
              <label>
                Name
                <input className="form-input" name="name" placeholder="Your name" />
              </label>
              <label>
                Work email
                <input className="form-input" name="email" type="email" placeholder="you@company.com" />
              </label>
              <label>
                Company
                <input className="form-input" name="company" placeholder="Company name" />
              </label>
              <label>
                Target timeline
                <input className="form-input" name="timeline" placeholder="e.g. pilot in 4 weeks" />
              </label>
              <label>
                Use case
                <textarea className="form-input form-textarea" name="message" placeholder="Describe your agent memory scenario" />
              </label>
              <button className="btn btn-solid" type="submit">
                Send inquiry
              </button>
            </form>
          </div>

          <div className="card">
            <SectionLead
              eyebrow="What to include"
              title="Help us respond faster"
              copy="Add these details and we can usually return a concrete implementation path in one round."
            />
            <ul className="list">
              <li>Primary agent workflows and expected request volume</li>
              <li>Current orchestration/runtime stack</li>
              <li>Auth, tenancy, and governance requirements</li>
              <li>Success metrics you care about in first 30-60 days</li>
            </ul>
            <p className="copy" style={{ marginTop: 12 }}>
              Direct email: <a href="mailto:founders@aionis.dev">founders@aionis.dev</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
