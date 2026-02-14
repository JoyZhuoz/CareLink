import React from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "./modules/BottomNav";
import "./MainLayout.css";

const MainLayout = () => {
  return (
    <div className="main-layout">
      <main className="main-layout-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default MainLayout;
