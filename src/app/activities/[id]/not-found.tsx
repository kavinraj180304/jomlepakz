import Link from "next/link";
export default function ActivityNotFound() {
  return <main id="main-content" className="space-y-4 p-6"><h1 className="page-title">Activity not found</h1><p className="helper-text">This activity is unavailable or you do not have access to it.</p><Link href="/my-activities" className="text-primary underline">My Activities</Link></main>;
}
