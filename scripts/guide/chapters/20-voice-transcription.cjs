module.exports = {
  id: "20-voice-transcription",
  title: "Voice transcription test",
  intro:
    "The <b>Test Transcribe</b> page lets a doctor or admin check that voice dictation works before relying on it in a visit. You record a short conversation, send it for transcription, and read back what the app heard, split into what the doctor said and what the patient said. Nothing you record here is saved to any patient's record.",
  sections: [
    {
      title: "When to use the test page",
      who: "Doctors, admins and owners",
      body: [
        "The microphone buttons in a visit (see the Visits and Prescriptions chapters) use the same transcription service. Use this page when you set up a new computer or headset, when dictation in a visit returns nothing, or when the text comes back garbled. If a recording works here, it will work in a visit.",
        "Open it from <b>Test Transcribe</b> in the Admin part of the menu. The page opens without the usual menu on the left. Use its own <b>Back to dashboard</b> button at the top right to return. Leaving the page stops any recording that is still running.",
      ],
      shots: [
        {
          file: "page",
          as: "doctor",
          caption: "The Voice Transcription Test page before anything is recorded.",
          viewport: { width: 1440, height: 500 },
          run: async (page, h) => {
            await h.goto("/test-transcribe");
            await page.getByRole("button", { name: "Start Recording" }).waitFor();
            await h.mark(page.getByText("Idle", { exact: true }), 1);
            await h.mark(page.getByRole("button", { name: "Start Recording" }), 2);
            await h.mark(page.getByRole("link", { name: "Back to dashboard" }), 3);
          },
        },
      ],
      fields: [
        ["1. Status and timer", "<b>Idle</b> when nothing is being recorded. While recording, a red <b>Recording</b> badge pulses and the timer counts minutes and seconds."],
        ["2. Start Recording", "Asks the browser for the microphone and starts recording. The first time, the browser asks you to allow microphone access. Click <b>Allow</b>."],
        ["3. Back to dashboard", "Leaves the page and stops the microphone."],
      ],
    },
    {
      title: "Record and transcribe a test clip",
      who: "Doctors, admins and owners",
      body: [
        "Record about 20 to 30 seconds of a normal consultation: the doctor asks a question, the patient answers. Two voices let you check that the app can tell the speakers apart.",
      ],
      steps: [
        "Click <b>Start Recording</b>. Allow the microphone if the browser asks.",
        "Watch the <b>Audio Level</b> bar while you speak. Green means a good level. Yellow is acceptable. Red, with the message <i>Low audio level</i>, means you should speak louder or move closer to the microphone.",
        "Click <b>Stop Recording</b>. A <b>Playback</b> player appears. Press play to hear what was captured.",
        "Click <b>Transcribe</b>. The button reads <b>Transcribing...</b> while the clip is processed. This takes a few seconds for a short clip.",
        "Read the result in the <b>Transcription Results</b> box that appears below.",
      ],
      fields: [
        ["Stop Recording", "Red button shown while recording. Ends the recording."],
        ["Transcribe", "Sends the recording for transcription. Shown after you stop."],
        ["Download", "Saves the recording to your computer as an audio file, for example to send to support if transcription keeps failing."],
        ["Clear", "Throws the recording and its result away so you can start again."],
        ["Chunks", "The recording is collected in 5-second pieces. The badge next to the timer counts them."],
      ],
      tips: [
        "A quiet room and a headset microphone give the best results.",
        "If an error appears in a red box under the recording controls, read it. <i>Permission denied</i> means the browser was not allowed to use the microphone: click the microphone or lock icon in the address bar and allow it.",
      ],
      shots: [],
    },
    {
      title: "Read the transcription result",
      who: "Doctors, admins and owners",
      body: [
        "The result has three tabs. They show the same recording in different ways.",
      ],
      fields: [
        ["Combined", "Everything that was said, as one block of text. If the box says <i>No speech detected</i>, the clip was too quiet or silent."],
        ["By Speaker", "The text split into a blue <b>Doctor</b> box and a green <b>Patient</b> box. If it says <i>No speaker separation available</i>, the clip was too short to tell the voices apart."],
        ["Segments", "Each stretch of speech in order, labelled <b>DOCTOR</b> or <b>PATIENT</b>, with how confident the app is about it as a percentage."],
      ],
      after: [
        "In a visit, the microphone next to <b>Chief Complaints</b> fills in the patient's words when the speakers can be told apart, and the full text otherwise. The microphone next to <b>Detailed Examination</b> always inserts the full text. Dictated text is added to the end of whatever is already in the box, so you can dictate in several parts.",
      ],
      shots: [],
    },
    {
      title: "The Diagnostics box",
      who: "Admins and support staff",
      body: [
        "After a recording, a <b>Diagnostics</b> box shows technical details: the number of chunks, the total size, the recording format, the duration, the average bitrate and the sample rate. It also explains how the recording is converted before transcription. You do not need these details for daily work. They help support staff when a recording fails.",
      ],
      shots: [],
    },
  ],
};
