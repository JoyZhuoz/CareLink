import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import Skeleton from "./components/pages/Skeleton";
import Dashboard from "./components/pages/Dashboard";
import Home from "./components/pages/Home";
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
      <Route path="/" element={<Home />}/>
      <Route path="/dashboard" element={<Dashboard />}/>
      <Route path="/skeleton" element={<Skeleton />}/>
    </Route>
  )
)

// renders React Component "Root" into the DOM element with ID "root"
ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
