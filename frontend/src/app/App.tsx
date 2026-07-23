import type { PropsWithChildren } from "react";

export function App({ children }: PropsWithChildren) {
  return <div className="app-shell">{children}</div>;
}