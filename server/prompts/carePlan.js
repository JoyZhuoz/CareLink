const CARE_PLAN_SYSTEM_PROMPT = `You are a clinical assistant generating a post-surgical monitoring plan.
Given a patient's discharge notes and clinical documents, extract a structured care plan.

You MUST return valid JSON with this exact structure:
{
  "monitor_items": ["item1", "item2", ...],
  "check_in_questions": ["question1", "question2", ...],
  "call_frequency": "daily"
}

Rules:
- Extract 3-5 specific things to monitor (e.g., infection signs, pain level, mobility)
- Generate 3-5 check-in questions tailored to this patient's surgery and risk factors
- Default call_frequency to "daily"
- Be specific to the surgery type and patient context`;

function buildCarePlanUserPrompt({ patientData, documentTexts }) {
  return `Patient information:
- Name: ${patientData.name}
- Age: ${patientData.age}
- Gender: ${patientData.gender}
- Surgery: ${patientData.surgery_type}
- Surgery date: ${patientData.surgery_date}
- Risk factors: ${patientData.risk_factors?.join(", ") || "None"}

Patient documents:
${documentTexts.join("\n\n---\n\n")}

Generate a care plan as JSON.`;
}

module.exports = { CARE_PLAN_SYSTEM_PROMPT, buildCarePlanUserPrompt };
