import React from "react";

const SearchBar = ({ value, onChange }) => {
  return (
    <div className="relative w-full mb-8">
      <input
        type="text"
        placeholder="Search by name, symptoms, or operation..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray text-black rounded-xl py-3 px-5 pr-12 text-sm outline-none border border-gray-200 focus:border-gray-400 transition-colors"
        style={{ color: "var(--tertiary)" }}
      />
      <svg
        className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
};

export default SearchBar;
