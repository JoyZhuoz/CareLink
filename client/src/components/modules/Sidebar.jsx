import React from "react";
import { useNavigate } from "react-router-dom";

const NAV_ROUTES = {
  dashboard: "/dashboard",
  analytics: "/analytics",
  chatbot: "/chatbot",
};

const Sidebar = ({ activePage }) => {
  const navigate = useNavigate();

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4a1 1 0 001-1v-4h2v4a1 1 0 001 1h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
        </svg>
      ),
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      ),
    },
    {
      id: "chatbot",
      label: "ChatBot",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
      ),
    },
  ];

  return (
    <aside
      className="h-full min-h-screen bg-secondary-20 rounded-corners flex flex-col py-8 px-5 z-10 overflow-hidden"
      style={{ width: "100%" }}
    >
      <h1
        className="text-3xl font-bold mb-10 px-2 cursor-pointer"
        style={{ color: "var(--primary)" }}
        onClick={() => navigate(NAV_ROUTES.dashboard)}

      >
        CareLink
      </h1>

      {/* navigation items */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(NAV_ROUTES[item.id])}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-secondary"
                  : "hover:bg-gray-100"
              }`}
              style={{ color: "var(--tertiary)" }}
            >
              {item.icon}
              <span className="text-lg">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
