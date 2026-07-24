import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { App } from "./app/App";
import { router } from "./app/router";
import { AuthProvider } from "./features/auth/AuthProvider";
import "./app/styles/tokens.css";
import "./app/styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App>
        <RouterProvider router={router} />
      </App>
    </AuthProvider>
  </React.StrictMode>,
);