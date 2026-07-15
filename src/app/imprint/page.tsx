import type { Metadata } from "next";

import {
  LegalDocument,
  LegalSection,
  legalLinkClassName,
} from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Imprint",
  description: "Operator and contact information for Padel Tourni.",
};

export default function ImprintPage() {
  return (
    <LegalDocument title="Imprint">
      <p className="font-semibold text-slate-500">
        Last updated: July 15, 2026
      </p>

      <LegalSection title="Information according to Section 5 DDG">
        <address className="not-italic">
          Asad Ullah Khalid
          <br />
          Mertensstr. 13c
          <br />
          13587 Berlin
          <br />
          Germany
        </address>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email:{" "}
          <a
            className={legalLinkClassName}
            href="mailto:asadkhalid305@gmail.com"
          >
            asadkhalid305@gmail.com
          </a>
        </p>
        <p>
          You can also use the Padel Tourni contact form for support, privacy,
          or deletion requests.
        </p>
      </LegalSection>

      <LegalSection title="About the service">
        <p>
          Padel Tourni is a privately operated, free recreational project for
          organizing padel events. It does not currently sell subscriptions,
          show advertising, or provide paid services.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
