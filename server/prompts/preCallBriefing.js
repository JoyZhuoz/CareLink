const PRE_CALL_BRIEFING_SYSTEM_PROMPT = `You are preparing a context briefing for an AI health check-in call.
The AI agent will use this briefing to conduct a voice call with the patient.

Generate a briefing with these sections:

1. OPENING (how to greet this patient — use their name, reference where they are in recovery)

2. PRIORITY QUESTIONS (ordered list, max 5)
   - The most important questions to ask today
   - For each: WHY this question matters right now
   - Include expected "normal" answers vs "concerning" answers

3. FOLLOW-UPS FROM LAST CALL
   - Anything the patient mentioned that needs revisiting
   - Any trends to probe (e.g., "pain was 6 last call, was 7 before that")

4. RED FLAGS
   - Specific patient responses that should trigger immediate concern
   - Based on medical reference: what symptoms at this recovery stage are emergencies

5. CONVERSATION GUIDELINES
   - Tone guidance (e.g., "patient was anxious last call, be reassuring")
   - Topics to avoid or be gentle about
   - Expected call duration`;

function buildPreCallBriefingUserPrompt({
  carePlan,
  daysSinceSurgery,
  callHistory,
  clinicianFlags,
  medicalReference,
}) {
  const historyText =
    callHistory.length > 0
      ? callHistory
          .map(
            (c, i) =>
              `Call ${i + 1} (${c.called_at}): ${JSON.stringify(c.transcript || c.questions_asked)}`
          )
          .join("\n")
      : "No previous calls.";

  const clinicianText =
    clinicianFlags.length > 0
      ? clinicianFlags
          .map(
            (f) =>
              `[${f.recommended_action}] ${f.concerning_findings || "No concerns"}`
          )
          .join("\n")
      : "No clinician notes.";

  const medRefText = medicalReference
    ? `Recovery milestones: ${medicalReference.recovery_milestones}\nRed flags: ${medicalReference.red_flag_symptoms}\nCommon concerns: ${medicalReference.common_concerns}`
    : "No medical reference available.";

  return `PATIENT CONTEXT:
- Name: ${carePlan.patient_name}
- Surgery: ${carePlan.surgery_type}
- Days since surgery: ${daysSinceSurgery}
- Care plan monitor items: ${carePlan.monitor_items}
- Check-in questions: ${carePlan.check_in_questions}

CALL HISTORY (last 3 calls):
${historyText}

CLINICIAN NOTES:
${clinicianText}

MEDICAL REFERENCE (current recovery stage):
${medRefText}

Generate the pre-call briefing.`;
}

module.exports = {
  PRE_CALL_BRIEFING_SYSTEM_PROMPT,
  buildPreCallBriefingUserPrompt,
};
