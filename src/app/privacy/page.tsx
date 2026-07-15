import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalDocument,
  LegalSection,
  legalLinkClassName,
} from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Padel Tourni processes personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy notice">
      <p className="font-semibold text-slate-500">
        Last updated: July 15, 2026
      </p>

      <LegalSection title="1. Who is responsible">
        <p>
          The controller responsible for processing personal data in Padel
          Tourni is:
        </p>
        <address className="not-italic">
          Asad Ullah Khalid
          <br />
          Mertensstr. 13c
          <br />
          13587 Berlin
          <br />
          Germany
          <br />
          Email:{" "}
          <a
            className={legalLinkClassName}
            href="mailto:asadkhalid305@gmail.com"
          >
            asadkhalid305@gmail.com
          </a>
        </address>
        <p>
          Padel Tourni is a privately operated, free recreational project. It
          does not offer subscriptions, display advertising, or sell personal
          data.
        </p>
      </LegalSection>

      <LegalSection title="2. Data processed by Padel Tourni">
        <p>
          The service processes only the data needed to operate its features:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Google account ID, name, and email address when you sign in;</li>
          <li>
            club memberships, roles, invitations, and the active club you
            select;
          </li>
          <li>
            player names, ratings, account links, availability, and active
            status entered by club organizers;
          </li>
          <li>
            event details, venues, draws, timers, match scores, standings, and
            event history;
          </li>
          <li>contact messages and an optional reply email address; and</li>
          <li>
            coarse product events such as opening the landing page, creating an
            event, accepting an invitation, or submitting feedback. These events
            may contain an internal user or club ID and limited non-sensitive
            metadata, but not invite tokens, player names, or match scores.
          </li>
        </ul>
        <p>
          Hosting and security providers may also process technical request data
          such as IP address, browser information, timestamps, and server logs
          when you access the service.
        </p>
      </LegalSection>

      <LegalSection title="3. Purposes and legal bases">
        <p>Personal data is processed for the following purposes:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            providing accounts, private clubs, invitations, tournaments,
            standings, and requested emails under Article 6(1)(b) GDPR;
          </li>
          <li>
            protecting the service, diagnosing errors, and understanding whether
            its core features work under Article 6(1)(f) GDPR. The legitimate
            interest is operating and improving a reliable free service; and
          </li>
          <li>
            replying to contact, privacy, or deletion requests under Article
            6(1)(b), 6(1)(c), or 6(1)(f) GDPR, depending on the request.
          </li>
        </ul>
        <p>
          There is no advertising profiling and no automated decision-making
          with legal or similarly significant effects.
        </p>
      </LegalSection>

      <LegalSection title="4. Google sign-in">
        <p>
          Padel Tourni uses Google OAuth through Supabase Auth. When you choose
          Google sign-in, Google authenticates you and provides the account ID,
          name, and email address needed to create or access your Padel Tourni
          account. Google processes the sign-in interaction under its own{" "}
          <a
            className={legalLinkClassName}
            href="https://policies.google.com/privacy"
          >
            privacy policy
          </a>
          . Padel Tourni does not receive your Google password, contacts, or
          friends list.
        </p>
      </LegalSection>

      <LegalSection title="5. Service providers and transfers">
        <p>
          The following providers process data only where needed to deliver the
          service:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Supabase</strong> for authentication and database storage;
          </li>
          <li>
            <strong>Vercel</strong> for application hosting and operational
            logs;
          </li>
          <li>
            <strong>Google</strong> for optional Google sign-in; and
          </li>
          <li>
            <strong>Resend</strong> for contact messages and final-standings
            emails.
          </li>
        </ul>
        <p>
          These providers may process data outside the European Economic Area.
          Where required, transfers are covered by an adequacy decision,
          Standard Contractual Clauses, or another legally recognized safeguard.
          Their own privacy notices describe their processing in more detail.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies and local preferences">
        <p>
          Padel Tourni uses only cookies needed for Google authentication,
          keeping a session active, and remembering the active club. These are
          necessary to provide the requested service. Padel Tourni does not use
          advertising cookies or third-party marketing trackers, so no marketing
          cookie banner is shown.
        </p>
      </LegalSection>

      <LegalSection title="7. Who can see club data">
        <p>
          Club members can see the roster, events, scores, standings, and
          history belonging to clubs they have joined. Club owners and admins
          can manage membership, invitations, players, and account links. Do not
          enter information about another person unless it is appropriate to
          share it with the members of that club.
        </p>
      </LegalSection>

      <LegalSection title="8. Retention and deletion">
        <p>
          Account, club, player, and event data is retained while it is needed
          to provide the service and preserve the event history requested by the
          club. Contact messages and delivery records are retained while they
          are needed to answer the request, diagnose a problem, or confirm email
          delivery. Coarse product events are retained only while useful for
          operating and improving the project.
        </p>
        <p>
          Data is deleted or anonymized when it is no longer needed, when the
          project is discontinued, or following a valid deletion request, unless
          a legal obligation or overriding legitimate reason requires limited
          further retention. Provider backups and security logs may remain for
          their normal restricted retention periods.
        </p>
      </LegalSection>

      <LegalSection title="9. Your rights">
        <p>
          Subject to the conditions in the GDPR, you may request access,
          correction, deletion, restriction, or portability of your personal
          data. You may object to processing based on legitimate interests and
          withdraw consent where processing relies on consent. Withdrawal does
          not affect processing that was lawful before it.
        </p>
        <p>
          Send a request through the{" "}
          <Link className={legalLinkClassName} href="/contact">
            contact form
          </Link>{" "}
          or email{" "}
          <a
            className={legalLinkClassName}
            href="mailto:asadkhalid305@gmail.com"
          >
            asadkhalid305@gmail.com
          </a>
          . You also have the right to complain to a data protection authority.
          The authority responsible for Berlin is the{" "}
          <a
            className={legalLinkClassName}
            href="https://www.datenschutz-berlin.de/buergerinnen-und-buerger/beschwerde/"
          >
            Berlin Commissioner for Data Protection and Freedom of Information
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to this notice">
        <p>
          This notice will be updated when the service starts processing data
          differently, adds another provider, or changes in a way that affects
          the information above. The current revision date appears at the top of
          this page.
        </p>
      </LegalSection>

      <p>
        See also the{" "}
        <Link className={legalLinkClassName} href="/terms">
          Terms of Service
        </Link>
        .
      </p>
    </LegalDocument>
  );
}
