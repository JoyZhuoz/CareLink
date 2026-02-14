import React from "react";
import { NavLink } from "react-router-dom";
import "./BottomNav.css";

const BottomNav = () => {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `bottom-nav-item ${isActive ? "bottom-nav-item--active" : ""}`
        }
      >
        <span className="bottom-nav-label">Dashboard</span>
      </NavLink>
      <NavLink
        to="/chat"
        className={({ isActive }) =>
          `bottom-nav-item ${isActive ? "bottom-nav-item--active" : ""}`
        }
      >
        <span className="bottom-nav-label">Chat</span>
      </NavLink>
    </nav>
  );
};

export default BottomNav;
