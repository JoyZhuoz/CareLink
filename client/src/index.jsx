import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import SidebarLayout from "./components/layouts/SidebarLayout";
import Dashboard from "./components/pages/Dashboard";
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
    <Route element={<App />} errorElement={<NotFound />}>
      <Route path="/" element={<SidebarLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="chatbot" element={<Chatbot />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>
  )
)

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
