import React, { useState, useRef, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../modules/Sidebar";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 350;

/** Map pathname → sidebar active page id */
function getActivePage(pathname) {
  if (pathname.startsWith("/chatbot")) return "chatbot";
  if (pathname.startsWith("/analytics")) return "analytics";
  return "dashboard";
}

const SidebarLayout = () => {
  const location = useLocation();
  const activePage = getActivePage(location.pathname);

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef(null);

  const handleResizeStart = (e) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      setSidebarWidth(() =>
        Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, start.width + delta))
      );
    };
    const onUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <div
        className="fixed top-0 left-0 h-screen z-10 flex shrink-0 flex-col"
        style={{
          width: isSidebarCollapsed ? 0 : sidebarWidth,
          transition: isResizing ? "none" : "width 0.2s ease",
          overflow: isSidebarCollapsed ? "hidden" : "visible",
        }}
      >
        <div className="h-screen" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <Sidebar activePage={activePage} />
        </div>
        {!isSidebarCollapsed && (
          <div
            role="separator"
            aria-label="Resize sidebar"
            onMouseDown={handleResizeStart}
            className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/20 z-20"
            style={{ right: 0 }}
          />
        )}
        {!isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            aria-label="Hide sidebar"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center z-30 bg-secondary hover:bg-secondary/90 transition-colors"
            style={{ color: "var(--tertiary)" }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {isSidebarCollapsed && (
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(false)}
          aria-label="Show sidebar"
          className="fixed left-0 top-1/2 -translate-y-1/2 w-6 h-12 rounded-r-lg flex items-center justify-center z-40 shadow-md bg-secondary hover:bg-secondary/90 transition-colors"
          style={{ color: "var(--tertiary)" }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Main content — each page fills this via <Outlet /> */}
      <main
        className="flex-1 min-h-screen transition-all duration-200"
        style={{ marginLeft: isSidebarCollapsed ? 0 : sidebarWidth }}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default SidebarLayout;
