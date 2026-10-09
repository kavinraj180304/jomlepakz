import { EmptyState } from "@/components/ui/screen-states";
import { ScreenHeader } from "@/components/ui/screen";
export default function NotFound() { return <main id="main-content"><ScreenHeader title="Page not found" back="/" /><div className="p-4"><EmptyState title="That page isn't here" message="The link may have changed. Discover is a good place to start." /></div></main>; }
