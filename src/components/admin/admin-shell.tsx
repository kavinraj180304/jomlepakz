import Link from "next/link";
import { ScreenHeader } from "@/components/ui/screen";
import { cn } from "@/lib/utils";
import { adminSections, adminUrl, type AdminDashboard, type AdminFilters } from "@/lib/admin/validation";
import { ModerationControl } from "./moderation-control";
const countLabels: Record<string, string> = { pending: "Pending reports", inReview: "In review", hiddenActivities: "Hidden activities", suspendedUsers: "Suspended users", bannedUsers: "Banned users", activeCategories: "Active categories" };
export function AdminShell({ data, filters, invalid }: { data: AdminDashboard; filters: AdminFilters; invalid: boolean }) {
  return <main id="main-content" tabIndex={-1}><ScreenHeader title="Administration" back="/settings" /><div className="space-y-6 p-5">
    <nav aria-label="Admin sections" className="horizontal-scroll flex gap-2 overflow-x-auto">{adminSections.map(section => <Link key={section} href={adminUrl({ section, page: 1 })} aria-current={filters.section === section ? "page" : undefined} className={cn("min-h-11 shrink-0 rounded-full px-5 py-2 text-sm font-semibold", filters.section === section ? "bg-primary text-white" : "bg-secondary")}>{section}</Link>)}</nav>
    {invalid && <p role="status" className="helper-text">Invalid filters. Showing Overview.</p>}
    {filters.section === "Overview" ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(data.counts).map(([key, count]) => <div key={key} className="rounded-xl border p-5"><p className="text-2xl font-bold">{count}</p><p className="helper-text">{countLabels[key]}</p></div>)}</div> : <section className="space-y-3"><h2 className="section-title">{filters.section}</h2>
      {data.items.map(item => <article key={item.id} className="rounded-xl border p-5">
        <h3 className="break-words font-semibold">{item.type === "report" ? item.subject : item.type === "activity" ? item.title : item.name}</h3>
        <p className="helper-text mt-2">{item.type === "category" ? item.active ? "Active" : "Inactive" : item.status}</p>
        {item.type === "report" && <><p className="helper-text mt-3">{item.targetType} / {item.reason}</p>{item.details && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.details}</p>}</>}
        <ModerationControl key={`${item.id}:${item.revision}`} item={item} />
      </article>)}
      {!data.items.length && <p className="helper-text">No records in this section.</p>}
    </section>}
    {filters.section !== "Overview" && <nav aria-label="Admin pages" className="flex min-h-11 items-center justify-between gap-4">
      {filters.page > 1 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={adminUrl({ ...filters, page: filters.page - 1 })}>Previous</Link> : <span />}
      <span className="helper-text">Page {filters.page}</span>
      {data.hasNext && filters.page < 500 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={adminUrl({ ...filters, page: filters.page + 1 })}>Next</Link> : <span />}
    </nav>}
  </div></main>;
}
