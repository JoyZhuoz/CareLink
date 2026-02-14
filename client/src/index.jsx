import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import SidebarLayout from "./components/layouts/SidebarLayout";
import Dashboard from "./components/pages/Dashboard";
import Analytics from "./components/pages/Analytics";
import Chatbot from "./components/pages/Chatbot";
import NotFound from "./components/pages/NotFound";

import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider
} from 'react-router-dom'

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route errorElement={<NotFound />} element={<App />}>
      {/* All main pages share the sidebar layout */}
      <Route element={<SidebarLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/chatbot" element={<Chatbot />} />
      </Route>
    </Route>
  )
)

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
