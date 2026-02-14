import React from "react";

const TabSwitcher = ({ activeTab, onTabChange }) => {
  return (
    <div className="inline-flex bg-secondary rounded-full p-1.5 shadow-lg mb-8">
      <button
        onClick={() => onTabChange('patients')}
        className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full font-semibold transition-all duration-200 ${
          activeTab === 'patients'
            ? 'bg-white text-blue-600 shadow-md scale-105'
            : 'text-gray-700 hover:text-gray-900 hover:bg-white hover:bg-opacity-30'
        }`}
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
        <span className="hidden xs:inline">Patients</span>
      </button>
      <button
        onClick={() => onTabChange('analytics')}
        className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full font-semibold transition-all duration-200 ${
          activeTab === 'analytics'
            ? 'bg-white text-gray-800 shadow-md scale-105'
            : 'text-gray-700 hover:text-gray-900 hover:bg-white hover:bg-opacity-30'
        }`}
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
        <span className="hidden xs:inline">Analytics</span>
      </button>
    </div>
  );
};

export default TabSwitcher;
