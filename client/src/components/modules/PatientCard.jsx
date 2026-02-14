import React from "react";

const PatientCard = ({ patient }) => {
  const getUrgencyColor = (urgency) => {
    switch (urgency.toLowerCase()) {
      case 'urgent':
        return 'bg-red-500 hover:bg-red-600';
      case 'minimal':
        return 'bg-green-500 hover:bg-green-600';
      case 'monitor':
        return 'bg-yellow-400 hover:bg-yellow-500';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  return (
    <div className="bg-secondary rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02]">
      {/* Patient Avatar */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full blur-md opacity-40"></div>
          <img
            src={patient.avatar}
            alt={patient.name}
            className="relative w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
          />
        </div>
      </div>

      {/* Patient Name and Date */}
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900">
          {patient.name}
        </h3>
        {patient.dischargeDate && !patient.showDischargeDate && (
          <p className="text-sm text-gray-600 mt-1">
            {patient.dischargeDate}
          </p>
        )}
      </div>

      {/* Patient Details */}
      <div className="space-y-4 mb-8">
        {/* Operation */}
        <div className="bg-white bg-opacity-50 rounded-xl p-4">
          <h4 className="font-bold text-gray-900 text-sm mb-1.5">Operation</h4>
          <p className="text-gray-800 font-medium">{patient.operation}</p>
        </div>

        {/* Recent Symptoms */}
        <div className="bg-white bg-opacity-50 rounded-xl p-4">
          <h4 className="font-bold text-gray-900 text-sm mb-1.5">Recent Symptoms</h4>
          <p className="text-gray-800 font-medium">{patient.symptoms}</p>
        </div>

        {/* AI Summary (if present) */}
        {patient.aiSummary && (
          <div className="bg-white bg-opacity-50 rounded-xl p-4">
            <h4 className="font-bold text-gray-900 text-sm mb-1.5">AI Summary</h4>
            <p className="text-gray-800 text-sm leading-relaxed">{patient.aiSummary}</p>
          </div>
        )}

      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-center">
        <button
          className={`${getUrgencyColor(
            patient.urgency
          )} text-white font-bold py-3 px-7 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105`}
        >
          {patient.urgency}
        </button>
        <button className="bg-tertiary hover:bg-black text-white font-bold py-3 px-7 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105">
          Contact
        </button>
      </div>
    </div>
  );
};

export default PatientCard;
