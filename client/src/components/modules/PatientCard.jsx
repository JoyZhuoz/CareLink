import React from "react";

const PatientCard = ({ patient, onSelect }) => {
  const getUrgencyColor = (urgency) => {
    switch (urgency.toLowerCase()) {
      case 'urgent':
        return 'bg-[#EB5757] hover:bg-[#d94c4c]';
      case 'minimal':
        return 'bg-green-500 hover:bg-green-600';
      case 'monitor':
        return 'bg-yellow-400 hover:bg-yellow-500';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  return (
    <div
      className="bg-secondary-50 shadow-md rounded-corners p-8 transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-lg"
      onClick={() => onSelect && onSelect(patient)}
    >
      {/* Patient Avatar */}
      <div className="flex justify-center mb-6">
        <img
          src={patient.avatar}
          alt={patient.name}
          className="w-32 h-32 rounded-full object-cover shadow-lg"
        />
      </div>

      {/* Patient Name and Date */}
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900">
          {patient.name}
          {patient.dischargeDate && !patient.showDischargeDate && (
            <span className="font-medium"> - {patient.dischargeDate}</span>
          )}
        </h3>
      </div>

      {/* Two-column: Operation and Recent Symptoms */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="font-bold text-gray-900 text-xl mb-1">Operation</h4>
          <p className="text-gray-800 text-xl">{patient.operation}</p>
        </div>
        <div>
          <h4 className="font-bold text-gray-900 text-xl mb-1">Recent Symptoms</h4>
          <p className="text-gray-800 text-xl">{Array.isArray(patient.symptoms) ? patient.symptoms.join(", ") : patient.symptoms}</p>
        </div>
      </div>

      {/* Discharge Date (if shown separately) */}
      {patient.showDischargeDate && patient.dischargeDate && (
        <div className="mb-6">
          <h4 className="font-bold text-gray-900 text-xl mb-1">Discharge Date</h4>
          <p className="text-gray-800 text-xl">{patient.dischargeDate}</p>
        </div>
      )}

      {patient.aiSummary && (
        <div className="mb-8">
          <h4 className="font-bold text-gray-900 text-xl mb-1.5">AI Summary</h4>
          <p className="text-gray-800 text-xl leading-relaxed">{patient.aiSummary}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        <button
          className={`${getUrgencyColor(
            patient.urgency
          )} text-white font-bold py-3 px-6 rounded-xl transition-all duration-200`}
        >
          {patient.urgency}
        </button>
        <button className="bg-[#55454F] hover:bg-[#453840] text-white font-bold py-3 px-6 rounded-xl transition-all duration-200">
          Contact
        </button>
      </div>
    </div>
  );
};

export default PatientCard;
