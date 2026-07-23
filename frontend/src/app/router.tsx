import { createBrowserRouter } from "react-router-dom";

import { CaseEntryPage } from "../features/case-entry/components/CaseEntryPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <CaseEntryPage />,
  },
]);