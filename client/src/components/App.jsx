import React from "react";
import { Outlet } from "react-router-dom";

import "../utilities.css";

/**
 * Define the "App" component
 */
const App = () => {
  return <Outlet />;
};

export default App;
