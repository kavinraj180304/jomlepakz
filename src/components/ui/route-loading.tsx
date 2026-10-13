import { ScreenHeader } from "./screen";
import { LoadingState } from "./screen-states";

export function RouteLoading({ title }: { title: string }) {
  return <main id="main-content" tabIndex={-1}>
    <ScreenHeader title={title} />
    <LoadingState label={`Loading ${title.toLowerCase()}`} />
  </main>;
}
