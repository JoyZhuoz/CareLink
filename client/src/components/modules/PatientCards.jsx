import React from "react";
import PatientCard from "./PatientCard";

const PatientCards = ({ patients, onSelect }) => {
  if (patients.length === 0) {
    return (
      <div className="bg-secondary rounded-corners p-12 text-center mt-4">
        <p className="text-lg font-semibold" style={{ color: "var(--tertiary)" }}>
          No patients match your search.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10 items-stretch">
      {patients.map((patient) => (
        <PatientCard key={patient.id} patient={patient} onSelect={onSelect} />
      ))}
    </div>
  );
};

export default PatientCards;
