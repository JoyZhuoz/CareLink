const CLINICIAN_SUMMARY_SYSTEM_PROMPT = `You are generating a clinical summary for a care team.
Be concise and actionable. Use medical terminology appropriate for clinicians.

You MUST return valid JSON with this exact structure:
{
  "patient_status": "1 sentence overall impression",
  "normal_findings": "what aligns with expected recovery",
  "concerning_findings": "what deviates, with specific patient quotes",
  "comparison_to_last_call": "better / worse / unchanged, with specifics",
  "recommended_action": "continue_monitoring | schedule_outreach | urgent_review",
  "open_questions": "anything the patient asked that needs a clinician's answer",
  "summary_text": "full narrative summary"
}`;

function buildClinicianSummaryUserPrompt({ carePlan, medicalReference, callDoc }) {
  const medRefText = medicalReference
    ? `Recovery milestones: ${medicalReference.recovery_milestones}\nRed flags: ${medicalReference.red_flag_symptoms}`
    : "No medical reference available.";

  return `CARE PLAN:
- Patient: ${carePlan.patient_name}
- Surgery: ${carePlan.surgery_type}
- Monitor items: ${carePlan.monitor_items}

MEDICAL REFERENCE:
${medRefText}

CALL TRANSCRIPT:
${JSON.stringify(callDoc.transcript)}

Overall call urgency: ${callDoc.overall_urgency}
Questions asked: ${callDoc.questions_asked}
Questions skipped: ${callDoc.questions_skipped || "None"}

Generate the clinician summary as JSON.`;
}

module.exports = { CLINICIAN_SUMMARY_SYSTEM_PROMPT, buildClinicianSummaryUserPrompt };
