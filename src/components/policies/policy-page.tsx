import { ScreenHeader } from "@/components/ui/screen";
import { policyDetails, type PolicyDocument } from "@/lib/policies/content";

export function PolicyPage({ document }: { document: PolicyDocument }) {
  return <main id="main-content" tabIndex={-1}>
    <ScreenHeader title={document.title} back="/" />
    <article className="space-y-7 break-words p-5 text-sm leading-relaxed">
      <aside aria-label="Draft policy notice" className="space-y-2 rounded-lg border border-primary/30 bg-accent p-4">
        <p className="font-semibold">Draft — requires review before public launch.</p>
        <p>Legal wording, operating practices and deployment settings must be reviewed before publication. Contact placeholders are not working reporting channels.</p>
        <p>Effective date: {policyDetails.effectiveDate}</p>
      </aside>
      <p>{document.introduction}</p>
      {document.sections.map(section => <section key={section.title} className="space-y-3">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        {section.bullets && <ul className="list-disc space-y-3 pl-5">{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}
      </section>)}
      <section className="space-y-3 rounded-lg border border-secondary p-4">
        <h2 className="text-lg font-semibold">Responsible team and contacts</h2>
        <p>Operator: {policyDetails.operator}</p>
        <p>Support, privacy and deletion requests: {policyDetails.contact}</p>
        <p>Safety reports: {policyDetails.safetyContact}</p>
        <p className="helper-text">These details must be replaced and monitored before public launch. No response deadline has been established.</p>
      </section>
    </article>
  </main>;
}
