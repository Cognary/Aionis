import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl } from "@/lib/site";

export default function ContactPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Contact</p>
        <h1>Talk to Aionis sales and solutions</h1>
        <p className="hero-copy">
          Share your target track (OSS, Cloud, Enterprise, or Platform Design Partner) and we will route your request with
          a concrete rollout recommendation.
        </p>

        <div className="two-col">
          <div className="card">
            <SectionLead
              eyebrow="Inquiry form"
              title="Share your context"
              copy="We use this intake to route builder, team, enterprise, and platform opportunities quickly."
            />
            <form
              className="list"
              action="mailto:founders@aionis.dev"
              method="post"
              encType="text/plain"
              name="contact_inquiry"
              data-analytics-submit={analyticsEvents.CONTACT_SUBMIT}
            >
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
                Interest track
                <select className="form-input" name="interest_track" defaultValue="cloud_builder">
                  <option value="oss_builder">OSS Builder</option>
                  <option value="cloud_builder">Cloud Builder</option>
                  <option value="cloud_team">Cloud Team</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="platform_design_partner">Platform Design Partner</option>
                </select>
              </label>
              <label>
                Team size
                <select className="form-input" name="team_size" defaultValue="6_20">
                  <option value="1_5">1-5</option>
                  <option value="6_20">6-20</option>
                  <option value="21_100">21-100</option>
                  <option value="101_plus">101+</option>
                </select>
              </label>
              <label>
                Target timeline
                <input className="form-input" name="timeline" placeholder="e.g. pilot in 4 weeks" />
              </label>
              <label>
                Deployment preference
                <select className="form-input" name="deployment_preference" defaultValue="cloud_managed">
                  <option value="oss_self_hosted">OSS self-hosted</option>
                  <option value="cloud_managed">Cloud managed</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="unsure">Not sure yet</option>
                </select>
              </label>
              <label>
                Use case
                <textarea className="form-input form-textarea" name="message" placeholder="Describe your agent memory scenario" />
              </label>
              <button className="btn btn-solid" type="submit" data-analytics-event={analyticsEvents.CONTACT_SUBMIT}>
                Send inquiry
              </button>
            </form>
          </div>

          <div className="card">
            <SectionLead
              eyebrow="Lead routing"
              title="How requests are qualified"
              copy="Routing is based on governance need, operating risk, and deployment urgency."
            />
            <ul className="list">
              <li>OSS / Builder: quick integration guidance and docs path</li>
              <li>Cloud Team: governance and rollout planning</li>
              <li>Enterprise: compliance, SLO ownership, and architecture review</li>
              <li>Platform: execution-memory pilot discovery</li>
            </ul>
            <p className="copy" style={{ marginTop: 12 }}>
              Direct email: <a href="mailto:founders@aionis.dev">founders@aionis.dev</a>
            </p>
            <div className="hero-cta" style={{ marginTop: 14 }}>
              <a className="btn btn-ghost" href={resolveDocsUrl("EXTERNAL_RELEASE_PRODUCT_PLAN.md")} target="_blank" rel="noreferrer">
                Open product plan
              </a>
              <Link className="btn btn-ghost" href="/pricing" data-analytics-event={analyticsEvents.OSS_TO_CLOUD_INTENT}>
                Open pricing model
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
