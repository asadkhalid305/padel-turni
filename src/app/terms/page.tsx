import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalDocument,
  LegalSection,
  legalLinkClassName,
} from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using the free Padel Turni service.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service">
      <p className="font-semibold text-slate-500">
        Last updated: July 15, 2026
      </p>

      <LegalSection title="1. About these terms">
        <p>
          These Terms of Service govern your use of Padel Turni, a privately
          operated, free recreational service for organizing padel events. By
          using Padel Turni, you agree to these terms and to use the service
          lawfully and respectfully.
        </p>
        <p>
          Padel Turni does not currently offer subscriptions, paid features,
          advertising, or a service-level guarantee.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts and Google sign-in">
        <p>
          You need a Google account to sign in. You are responsible for using an
          account that belongs to you and for keeping access to that Google
          account secure. Padel Turni does not receive your Google password.
        </p>
        <p>
          One Google account may belong to multiple clubs. You are responsible
          for checking which club is active before viewing or changing club
          data.
        </p>
      </LegalSection>

      <LegalSection title="3. Clubs, invitations, and shared information">
        <p>
          Club owners and admins can invite other people using invite links,
          manage membership, and enter player or event information. Anyone who
          receives a valid invite link may be able to join the associated club,
          depending on the link settings. Owners and admins should revoke links
          that should no longer be used.
        </p>
        <p>
          Information entered into a club, including player names, ratings,
          event details, scores, standings, and history, may be visible to
          members of that club. Only enter information that you are allowed to
          share with those members. The separate{" "}
          <Link className={legalLinkClassName} href="/privacy">
            Privacy Notice
          </Link>{" "}
          explains how this information is processed.
        </p>
      </LegalSection>

      <LegalSection title="4. Tournament information">
        <p>
          Padel Turni helps organize draws, timers, scores, standings, and
          history. It is an organizational tool, not an official referee,
          governing body, or guarantee of a particular tournament outcome.
          Organizers remain responsible for checking player information,
          settings, scores, court arrangements, and the safety of their event.
        </p>
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>You must not use Padel Turni to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>break the law or violate another person&apos;s rights;</li>
          <li>
            access a club, invite link, account, or data without permission;
          </li>
          <li>
            upload malicious code, disrupt the service, or bypass security
            controls; or
          </li>
          <li>harass, threaten, impersonate, or abuse other users.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Availability and changes">
        <p>
          The service is provided on an ongoing experimental basis. It may be
          changed, temporarily interrupted, or discontinued for maintenance,
          security, technical, or project reasons. We will take reasonable care
          to operate it, but cannot promise that it will always be available or
          error-free.
        </p>
        <p>
          We may update these terms when the service or its legal requirements
          change. The current version and revision date will remain available at
          this URL.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspension and account closure">
        <p>
          We may suspend or restrict access where reasonably necessary to
          protect users, club data, the service, or the law, including where
          these terms are violated. You may stop using the service at any time
          and request deletion of your personal data through the{" "}
          <Link className={legalLinkClassName} href="/contact">
            contact form
          </Link>
          . Deletion may affect club records and event history that other club
          members rely on, so requests may require clarification before they are
          completed.
        </p>
      </LegalSection>

      <LegalSection title="8. Ownership and feedback">
        <p>
          Padel Turni, its branding, and its original interface and content
          remain protected by applicable intellectual-property laws. These terms
          give you permission to use the service for its intended,
          non-commercial purpose; they do not transfer ownership to you.
        </p>
        <p>
          You retain rights in information you provide, subject to the rights of
          other people whose information you enter. You allow Padel Turni to
          store, process, and display that information as needed to provide the
          service to your clubs. Suggestions and feedback may be used to improve
          the project without payment or separate approval.
        </p>
      </LegalSection>

      <LegalSection title="9. Liability">
        <p>
          Nothing in these terms excludes or limits liability where that is not
          permitted by applicable law. Subject to that limitation, Padel Turni
          is provided as a free recreational service, and you should keep any
          records that are important to your event independently of the service.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact and applicable law">
        <p>
          Questions about these terms can be sent through the{" "}
          <Link className={legalLinkClassName} href="/contact">
            contact form
          </Link>{" "}
          or by email to{" "}
          <a
            className={legalLinkClassName}
            href="mailto:asadkhalid305@gmail.com"
          >
            asadkhalid305@gmail.com
          </a>
          .
        </p>
        <p>
          German law applies, subject to any mandatory consumer protections that
          apply in the country where you live.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
