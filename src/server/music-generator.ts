import {
  MidiEvent,
  Note,
  Scale,
  Pedal,
  WeatherData,
  MicrophoneData,
} from "../shared/types";

// Music theory constants
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

// State variables
let currentKey = Math.floor(Math.random() * 12); // 0-11 for C through B
let currentScale: Scale = "major";
let lastModeChangeTime = Date.now();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _noteCounter = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let density = 0.7; // Probability of generating a note vs. silence

// Store selected scales for microphone-influenced music
let primaryScale: Scale = "major";
let secondaryScales: Scale[] = ["minor", "lydian"];
let noteCountInMeasure = 4; // Default 4/4 time signature

// Initialize scales on first run
(function initializeScales() {
  // Pick a random primary scale
  const scaleNames = Object.keys(SCALES) as Scale[];
  primaryScale = scaleNames[Math.floor(Math.random() * scaleNames.length)];

  // Select compatible secondary scales
  secondaryScales = selectCompatibleScales(primaryScale);

  // Initially set the current scale to primary
  currentScale = primaryScale;

  console.log(`Music initialized with primary scale: ${primaryScale}`);
  console.log(`Compatible scales selected: ${secondaryScales.join(", ")}`);
})();

// Apply weather influence to music parameters
function applyWeatherInfluence(weather: WeatherData | null) {
  // Reset to defaults if no weather data
  if (!weather) {
    density = defaultSettings.density;
    return defaultSettings;
  }

  // Create settings object with defaults
  const settings = { ...defaultSettings };

  // Modify based on temperature
  if (weather.temperature < 0) {
    // Very cold: slower, lower register, minor scales
    settings.tempo = 70;
    settings.minOctave = 1;
    settings.maxOctave = 5;
    settings.noteDurationRange = { min: 800, max: 3500 };
    settings.velocityRange = { min: 40, max: 80 };
    if (Math.random() < 0.6 && currentScale === "major") {
      currentScale = "minor";
    }
  } else if (weather.temperature < 10) {
    // Cool: slightly slower, mid-low register
    settings.tempo = 85;
    settings.minOctave = 2;
    settings.maxOctave = 6;
    settings.noteDurationRange = { min: 600, max: 3000 };
    if (Math.random() < 0.4 && currentScale === "major") {
      currentScale = "minor";
    }
  } else if (weather.temperature > 30) {
    // Very hot: faster, higher register, brighter scales
    settings.tempo = 130;
    settings.minOctave = 3;
    settings.maxOctave = 7;
    settings.noteDurationRange = { min: 300, max: 1800 };
    settings.velocityRange = { min: 70, max: 110 };
    if (Math.random() < 0.6 && currentScale === "minor") {
      currentScale = "major";
    }
  } else if (weather.temperature > 25) {
    // Warm: slightly faster, mid-high register
    settings.tempo = 115;
    settings.minOctave = 3;
    settings.maxOctave = 7;
    settings.noteDurationRange = { min: 400, max: 2200 };
    if (Math.random() < 0.4 && currentScale === "minor") {
      currentScale = "lydian";
    }
  }

  // Modify based on weather conditions
  const code = weather.weatherCode;

  // Clear conditions (0, 1)
  if ([0, 1].includes(code)) {
    settings.density = 0.6; // Slightly sparse
    settings.sustainProbability = 0.03; // Less sustain
  }
  // Cloudy conditions (2, 3)
  else if ([2, 3].includes(code)) {
    settings.density = 0.7; // Moderate density
  }
  // Fog conditions (45, 48)
  else if ([45, 48].includes(code)) {
    settings.density = 0.5; // More sparse
    settings.sustainProbability = 0.1; // More sustain
    settings.velocityRange = { min: 40, max: 70 }; // Softer
  }
  // Rain conditions
  else if (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)
  ) {
    settings.sustainProbability = 0.15; // Much more sustain
    settings.noteDurationRange = { min: 200, max: 1500 }; // Shorter notes
    settings.density = 0.8; // More notes
  }
  // Snow conditions
  else if ([71, 73, 75, 77, 85, 86].includes(code)) {
    settings.tempo = Math.max(70, settings.tempo - 20); // Slower
    settings.velocityRange = { min: 30, max: 70 }; // Softer
    settings.noteDurationRange = { min: 800, max: 3000 }; // Longer notes
  }
  // Thunderstorm conditions
  else if ([95, 96, 99].includes(code)) {
    settings.velocityRange = { min: 40, max: 127 }; // Dramatic dynamics
    settings.density = 0.9; // More dense
  }

  // Update global density
  density = settings.density;

  return settings;
}
// Weather influence settings
const defaultSettings = {
  tempo: 100, // Base tempo (events per minute)
  density: 0.7, // Probability of generating notes vs. silence
  minOctave: 1, // Minimum octave
  maxOctave: 7, // Maximum octave
  sustainProbability: 0.05, // Probability of using sustain pedal
  velocityRange: { min: 60, max: 100 }, // Velocity range for notes
  noteDurationRange: { min: 500, max: 2500 }, // Duration range in ms
};

// Select compatible scales based on a primary scale
function selectCompatibleScales(primary: Scale): Scale[] {
  // Define scale compatibility map (scales that sound good together)
  const compatibilityMap: Record<Scale, Scale[]> = {
    major: ["lydian", "mixolydian", "pentatonicMajor"],
    minor: ["dorian", "phrygian", "pentatonicMinor"],
    dorian: ["minor", "mixolydian", "pentatonicMinor"],
    phrygian: ["minor", "locrian"],
    lydian: ["major", "mixolydian"],
    mixolydian: ["major", "dorian"],
    locrian: ["phrygian", "minor"],
    pentatonicMajor: ["major", "lydian"],
    pentatonicMinor: ["minor", "dorian"],
    wholeTone: ["lydian", "major"], // Whole tone is fairly unique, but can work with these
  };

  // Get compatible scales for the primary
  const compatibles = compatibilityMap[primary];

  // Randomly select two (or fewer if not enough options)
  const selected: Scale[] = [];

  // Create a copy of the array to avoid modifying the original
  const options = [...compatibles];

  // Select up to 2 scales
  for (let i = 0; i < 2 && options.length > 0; i++) {
    const index = Math.floor(Math.random() * options.length);
    selected.push(options[index]);
    options.splice(index, 1); // Remove selected scale from options
  }

  return selected;
}

// Apply microphone influence to music parameters
function applyMicrophoneInfluence(
  mic: MicrophoneData | null,
  settings: typeof defaultSettings,
) {
  // If no microphone data or mic is inactive, return settings unmodified
  if (!mic || !mic.isActive) {
    return settings;
  }

  // Modify tempo based on volume
  // Louder = faster, quieter = slower
  if (mic.volume > 0.6) {
    // Very loud
    settings.tempo = 140;
    settings.noteDurationRange = { min: 200, max: 1000 };
  } else if (mic.volume > 0.3) {
    // Moderate volume
    settings.tempo = 100 + Math.floor(mic.volume * 60); // 100-130
    settings.noteDurationRange = { min: 300, max: 1500 };
  } else {
    // Soft
    settings.tempo = Math.max(60, 80 + Math.floor(mic.volume * 50)); // 80-95
    settings.noteDurationRange = { min: 500, max: 2500 };
  }

  // Adjust time signature (notes per measure) based on volume
  const previousNoteCount = noteCountInMeasure;
  if (mic.volume > 0.7) {
    noteCountInMeasure = 7; // 7/8 time
  } else if (mic.volume > 0.5) {
    noteCountInMeasure = 6; // 6/8 time
  } else if (mic.volume > 0.3) {
    noteCountInMeasure = 4; // 4/4 time (standard)
  } else if (mic.volume > 0.15) {
    noteCountInMeasure = 3; // 3/4 time (waltz)
  } else {
    noteCountInMeasure = 2; // 2/4 time
  }

  // If note count changed, log it
  if (previousNoteCount !== noteCountInMeasure) {
    console.log(
      `Time signature changed to ${noteCountInMeasure}/4 based on volume ${Math.round(mic.volume * 100)}%`,
    );
  }

  // Modify density based on volume
  settings.density = Math.min(0.9, 0.5 + mic.volume * 0.4); // 0.5 to 0.9

  // Use dominant frequencies to influence pitch range
  if (mic.dominantFrequencies.length > 0) {
    // Get primary frequency (most dominant)
    const primaryFreq = mic.dominantFrequencies[0];

    // Map frequency to octave range (logarithmically)
    // Lower frequencies -> lower octaves, higher frequencies -> higher octaves
    if (primaryFreq < 100) {
      settings.minOctave = 1;
      settings.maxOctave = 3;
    } else if (primaryFreq < 300) {
      settings.minOctave = 2;
      settings.maxOctave = 4;
    } else if (primaryFreq < 1000) {
      settings.minOctave = 3;
      settings.maxOctave = 5;
    } else if (primaryFreq < 3000) {
      settings.minOctave = 4;
      settings.maxOctave = 6;
    } else {
      settings.minOctave = 5;
      settings.maxOctave = 7;
    }
  }

  // Influence dynamic range based on volume variability
  // (This would require tracking volume over time, for now we use a simplified approach)
  if (mic.volume > 0.5) {
    settings.velocityRange = { min: 80, max: 120 }; // Louder dynamics
  } else if (mic.volume < 0.2) {
    settings.velocityRange = { min: 30, max: 70 }; // Softer dynamics
  } else {
    settings.velocityRange = { min: 50, max: 90 }; // Medium dynamics
  }

  return settings;
}

// Helper function to get notes in the current key and scale
function getScaleNotes(): number[] {
  return SCALES[currentScale].map((interval) => (currentKey + interval) % 12);
}

// Helper function to generate a random note in the current key and scale
function generateRandomNote(
  weather: WeatherData | null,
  micData: MicrophoneData | null = null,
  customOctaveRange?: { min: number; max: number },
): Note {
  const settings = applyWeatherInfluence(weather);

  // Apply microphone influence if available
  if (micData && micData.isActive) {
    applyMicrophoneInfluence(micData, settings);
  }

  const scaleNotes = getScaleNotes();
  const noteIndex = Math.floor(Math.random() * scaleNotes.length);
  const note = scaleNotes[noteIndex];

  // Use custom octave range if provided, otherwise use weather-influenced range
  const octaveRange = customOctaveRange || {
    min: settings.minOctave,
    max: settings.maxOctave,
  };

  const octave =
    Math.floor(Math.random() * (octaveRange.max - octaveRange.min + 1)) +
    octaveRange.min;
  const midiNum = note + octave * 12 + 12; // MIDI note numbers start at C0 = 12

  // Velocity influenced by weather and microphone
  const velocity =
    Math.floor(
      Math.random() *
        (settings.velocityRange.max - settings.velocityRange.min + 1),
    ) + settings.velocityRange.min;

  // Duration influenced by weather and microphone
  const duration =
    Math.random() *
      (settings.noteDurationRange.max - settings.noteDurationRange.min) +
    settings.noteDurationRange.min;

  return {
    name: NOTES[note],
    octave,
    midiNumber: midiNum,
    velocity,
    duration,
  };
}

// Function to generate chords in the current key and scale
function generateChord(
  weather: WeatherData | null,
  micData: MicrophoneData | null = null,
  numNotes = 3,
): Note[] {
  const settings = applyWeatherInfluence(weather);

  // Apply microphone influence if available
  if (micData && micData.isActive) {
    applyMicrophoneInfluence(micData, settings);
  }

  const scaleNotes = getScaleNotes();
  const rootIndex = Math.floor(Math.random() * scaleNotes.length);
  const rootNote = scaleNotes[rootIndex];

  const chordNotes: Note[] = [];

  // Adjust octave range based on weather and microphone
  const rootOctave =
    Math.floor(Math.random() * 3) + Math.max(2, settings.minOctave);

  // Root note with weather-influenced velocity and duration
  const rootVelocity =
    Math.floor(Math.random() * 30) + settings.velocityRange.min;
  const rootDuration =
    Math.random() *
      (settings.noteDurationRange.max - settings.noteDurationRange.min) +
    settings.noteDurationRange.min;

  chordNotes.push({
    name: NOTES[rootNote],
    octave: rootOctave,
    midiNumber: rootNote + rootOctave * 12 + 12,
    velocity: rootVelocity,
    duration: rootDuration,
  });

  // Add other chord tones (using 3rds)
  for (let i = 1; i < numNotes; i++) {
    const nextIndex = (rootIndex + i * 2) % scaleNotes.length;
    const nextNote = scaleNotes[nextIndex];
    const nextOctave = rootOctave + (nextIndex < rootIndex ? 1 : 0);

    chordNotes.push({
      name: NOTES[nextNote],
      octave: nextOctave,
      midiNumber: nextNote + nextOctave * 12 + 12,
      velocity:
        Math.floor(Math.random() * 20) +
        Math.max(40, settings.velocityRange.min - 20),
      duration: chordNotes[0].duration * (0.8 + Math.random() * 0.4), // Slight variation from root
    });
  }

  return chordNotes;
}

// Occasionally change key, scale, or mode
function maybeChangeMusicalContext(
  microphoneData: MicrophoneData | null = null,
): void {
  const now = Date.now();

  // Generate random musical events based on mic input
  if (microphoneData?.isActive) {
    // More frequent changes when microphone is active
    if (now - lastModeChangeTime > 60 * 1000 && Math.random() < 0.03) {
      const changeType = Math.floor(Math.random() * 3);

      if (changeType === 0) {
        // Change key
        currentKey = Math.floor(Math.random() * 12);
      } else if (changeType === 1) {
        // Change scale - use either primary or one of secondary scales
        const useSecondary = Math.random() < 0.6; // 60% chance to use secondary
        if (useSecondary && secondaryScales.length > 0) {
          // Pick one of the secondary scales
          currentScale =
            secondaryScales[Math.floor(Math.random() * secondaryScales.length)];
        } else {
          // Use primary scale
          currentScale = primaryScale;
        }
      } else {
        // Change both key and scale
        currentKey = Math.floor(Math.random() * 12);
        const useSecondary = Math.random() < 0.4; // 40% chance to use secondary
        if (useSecondary && secondaryScales.length > 0) {
          // Pick one of the secondary scales
          currentScale =
            secondaryScales[Math.floor(Math.random() * secondaryScales.length)];
        } else {
          // Use primary scale
          currentScale = primaryScale;
        }
      }

      console.log(
        `Musical context changed: Key ${NOTES[currentKey]}, Scale ${currentScale}`,
      );
      lastModeChangeTime = now;
    }
  } else {
    // Standard behavior without microphone
    // Change approximately every 3-5 minutes
    if (now - lastModeChangeTime > 3 * 60 * 1000 && Math.random() < 0.01) {
      // 1% chance per check when we're past the minimum time
      const changeType = Math.floor(Math.random() * 3);

      if (changeType === 0) {
        // Change key
        currentKey = Math.floor(Math.random() * 12);
      } else if (changeType === 1) {
        // Change scale
        const scaleNames = Object.keys(SCALES) as Scale[];
        currentScale =
          scaleNames[Math.floor(Math.random() * scaleNames.length)];
      } else {
        // Change both
        currentKey = Math.floor(Math.random() * 12);
        const scaleNames = Object.keys(SCALES) as Scale[];
        currentScale =
          scaleNames[Math.floor(Math.random() * scaleNames.length)];
      }

      lastModeChangeTime = now;
    }
  }
}

// Track last time sustain pedal was turned off
let lastSustainOffTime = Date.now();
let sustainPedalEnabled = true;

// Decide which pedal to use
function decidePedal(weather: WeatherData | null): Pedal | null {
  const settings = applyWeatherInfluence(weather);
  const rand = Math.random();
  const now = Date.now();

  // Ensure long periods without sustain pedal (at least 15-30 seconds)
  const timeSinceLastOff = now - lastSustainOffTime;
  if (
    !sustainPedalEnabled &&
    timeSinceLastOff > 15000 + Math.random() * 15000
  ) {
    sustainPedalEnabled = true;
  } else if (sustainPedalEnabled && Math.random() < 0.01) {
    // Occasionally disable sustain pedal for a period
    sustainPedalEnabled = false;
    lastSustainOffTime = now;
    return { type: "sustain", value: 0 }; // Turn off sustain pedal
  }

  // Weather-influenced sustain pedal probability
  if (rand < settings.sustainProbability && sustainPedalEnabled) {
    return { type: "sustain", value: Math.random() * 0.5 + 0.5 }; // 0.5-1.0
  } else if (rand < settings.sustainProbability * 2) {
    return { type: "sostenuto", value: 1 };
  } else if (rand < settings.sustainProbability * 3) {
    return { type: "soft", value: Math.random() * 0.7 + 0.3 }; // 0.3-1.0
  }

  return null;
}

// Main function to generate MIDI events
export function generateMidiEvent(
  weather: WeatherData | null = null,
  microphoneData: MicrophoneData | null = null,
): MidiEvent {
  _noteCounter++;
  maybeChangeMusicalContext(microphoneData);

  const settings = applyWeatherInfluence(weather);

  // Apply microphone influence if available
  if (microphoneData && microphoneData.isActive) {
    applyMicrophoneInfluence(microphoneData, settings);
  }

  // Randomly introduce silence based on density setting
  if (Math.random() > settings.density) {
    // Return a "silence" event - not an actual MIDI event, but used to
    // indicate that nothing is happening for this interval
    return {
      type: "silence",
      duration: Math.random() * 500 + 100, // 100-600ms of silence
    };
  }

  // Occasionally use pedals
  const pedal = decidePedal(weather);
  if (pedal) {
    return {
      type: "pedal",
      pedal,
    };
  }

  // If microphone active, use dominant frequencies to influence note selection
  if (
    microphoneData?.isActive &&
    microphoneData.dominantFrequencies.length > 0
  ) {
    // Generate interesting musical events based on microphone input
    // The rarer the event, the more interesting but potentially disruptive it could be
    const rareEventThreshold = 0.05; // 5% chance
    const interestingEventThreshold = 0.15; // 15% chance

    const eventType = Math.random();

    if (eventType < rareEventThreshold) {
      // Rare event - temporary scale modulation based on microphone
      // We use one of the secondary scales for this special chord
      const originalScale = currentScale;
      currentScale =
        secondaryScales[Math.floor(Math.random() * secondaryScales.length)];

      // Generate a chord in this alternate scale
      const specialChord = generateChord(weather, microphoneData, 4); // 4-note chord

      // Restore original scale
      currentScale = originalScale;

      return {
        type: "chord",
        notes: specialChord,
        currentKey: NOTES[currentKey],
        currentScale: originalScale, // Return the main scale, not the temporary one
      };
    } else if (eventType < interestingEventThreshold) {
      // Interesting but not rare event - counterpoint based on dominant frequencies
      const numVoices = Math.min(
        microphoneData.dominantFrequencies.length + 1,
        4,
      );
      const notes: Note[] = [];

      for (let i = 0; i < numVoices; i++) {
        // Use microphone data to influence register
        notes.push(
          generateRandomNote(weather, microphoneData, {
            min: settings.minOctave,
            max: settings.maxOctave,
          }),
        );
      }

      return {
        type: "counterpoint",
        notes,
        currentKey: NOTES[currentKey],
        currentScale,
      };
    }
  }

  // Standard event generation
  const eventType = Math.random();

  // Adjust event probabilities based on note count in measure
  const noteProb = noteCountInMeasure <= 3 ? 0.6 : 0.5; // More single notes in simpler time signatures
  const chordProb = noteCountInMeasure >= 6 ? 0.4 : 0.3; // More chords in complex time signatures

  if (eventType < noteProb) {
    // Generate a single note
    return {
      type: "note",
      note: generateRandomNote(weather, microphoneData),
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else if (eventType < noteProb + chordProb) {
    // Generate a chord
    // Adjust chord size based on time signature
    const chordSize = Math.min(
      Math.floor(Math.random() * 3) + 3, // 3-5 notes
      noteCountInMeasure, // Limited by time signature
    );

    return {
      type: "chord",
      notes: generateChord(weather, microphoneData, chordSize),
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else {
    // Generate counterpoint (2-4 notes across different registers)
    // Adjust voice count based on time signature
    const numVoices = Math.min(
      Math.floor(Math.random() * 3) + 2, // 2-4 voices
      Math.ceil(noteCountInMeasure / 2), // Limited by time signature
    );

    const notes: Note[] = [];

    for (let i = 0; i < numVoices; i++) {
      // Assign each voice to a different register, influenced by weather and microphone
      const localSettings = { ...settings };
      if (microphoneData?.isActive) {
        applyMicrophoneInfluence(microphoneData, localSettings);
      }

      const range = Math.min(
        localSettings.maxOctave - localSettings.minOctave,
        5,
      );
      const segment = range / numVoices;
      const minOctave = Math.max(
        localSettings.minOctave,
        Math.floor(localSettings.minOctave + i * segment),
      );
      const maxOctave = Math.min(
        localSettings.maxOctave,
        Math.ceil(localSettings.minOctave + (i + 1) * segment),
      );

      notes.push(
        generateRandomNote(weather, microphoneData, {
          min: minOctave,
          max: maxOctave,
        }),
      );
    }

    return {
      type: "counterpoint",
      notes,
      currentKey: NOTES[currentKey],
      currentScale,
    };
  }
}
