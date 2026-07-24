import { createBrowserRouter } from "react-router-dom";

import { CaseEntryPage } from "../features/case-entry/components/CaseEntryPage";
import { UserListPage } from "../features/user-list/components/UserListPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <CaseEntryPage />,
  },
  {
    path: "/admin/users",
    element: <UserListPage />,
  },
]);