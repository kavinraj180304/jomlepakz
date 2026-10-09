import Link from "next/link";
export default function ActivityNotFound() {
  return <main id="main-content" className="space-y-4 p-6"><h1 className="page-title">Activity not found</h1><p className="helper-text">This activity is not part of the demo.</p><Link href="/" className="text-primary underline">Back to Discover</Link></main>;
}
