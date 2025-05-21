import { MidiEvent, Note, Scale, Pedal, WeatherData } from "../shared/types";

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
let currentScale: Scale = "mixolydian"; // Default to mixolydian for SF Streets
let lastModeChangeTime = Date.now();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _noteCounter = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let density = 0.7; // Probability of generating a note vs. silence

// Track last time sustain pedal was turned off
let lastSustainOffTime = Date.now();
let sustainPedalEnabled = true;

// 12-tone serialist implementation
const CHROMATIC_NOTES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
let usedNotes = new Set<number>();
let serialistMode = true; // Enable 12-tone serialist approach
let notesToneRowLength = 0; // Counter for tracking tone row progress
let repeatNoteChance = 0.15; // Chance of allowing a note to repeat

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
  density: 0.6, // Probability of generating notes vs. silence (reduced from 0.7)
  minOctave: 1, // Minimum octave
  maxOctave: 7, // Maximum octave
  sustainProbability: 0.05, // Probability of using sustain pedal
  velocityRange: { min: 60, max: 100 }, // Velocity range for notes
  noteDurationRange: { min: 500, max: 2500 }, // Duration range in ms
};

// Helper function to get notes in the current key and scale
function getScaleNotes(): number[] {
  return SCALES[currentScale].map((interval) => (currentKey + interval) % 12);
}

// Helper function for 12-tone serialist approach
function getNextSerialNote(): number {
  // If all 12 notes have been used, reset the tracking but only 60% of the time
  // This allows the tone row to occasionally extend beyond 12 notes
  if (usedNotes.size === 12 && Math.random() < 0.6) {
    usedNotes.clear();
    notesToneRowLength = 0;
  }
  
  // Track how many notes we've used in this tone row
  notesToneRowLength++;
  
  // Occasionally allow note repetition (but only after using at least 5 different notes)
  // This makes the serialist approach less strict, more musical
  const shouldAllowRepetition = usedNotes.size >= 5 && Math.random() < repeatNoteChance;
  
  if (shouldAllowRepetition) {
    // Get a previously used note for repetition
    const usedNoteArray = Array.from(usedNotes);
    // Only repeat a note that has been used a while ago (prefer notes from earlier in the row)
    const earlierUsedNotes = usedNoteArray.slice(0, Math.ceil(usedNoteArray.length * 0.6));
    if (earlierUsedNotes.length > 0) {
      return earlierUsedNotes[Math.floor(Math.random() * earlierUsedNotes.length)];
    }
  }
  
  // Find a note that hasn't been used yet
  const availableNotes = CHROMATIC_NOTES.filter(note => !usedNotes.has(note));
  
  // If we have available notes, pick one that's preferably in the mixolydian scale
  if (availableNotes.length > 0) {
    const mixolydianNotes = SCALES.mixolydian.map((interval) => (currentKey + interval) % 12);
    const inScaleAvailableNotes = availableNotes.filter(note => mixolydianNotes.includes(note));
    
    // If we have notes that are both unused and in scale, prefer those
    // Otherwise use any available note to maintain 12-tone serialist approach
    const notePool = inScaleAvailableNotes.length > 0 ? inScaleAvailableNotes : availableNotes;
    const selectedIndex = Math.floor(Math.random() * notePool.length);
    const selectedNote = notePool[selectedIndex];
    
    // Mark this note as used
    usedNotes.add(selectedNote);
    return selectedNote;
  } else {
    // Fallback case - should never happen but just in case
    const selectedNote = Math.floor(Math.random() * 12);
    usedNotes.add(selectedNote);
    return selectedNote;
  }
}

// Helper function to generate a random note in the current key and scale
function generateRandomNote(
  weather: WeatherData | null,
  customOctaveRange?: { min: number; max: number },
): Note {
  const settings = applyWeatherInfluence(weather);
  
  // Note selection based on whether we're using serialist approach or not
  let note;
  if (serialistMode) {
    note = getNextSerialNote();
  } else {
    // Original approach using scale
    const scaleNotes = getScaleNotes();
    const noteIndex = Math.floor(Math.random() * scaleNotes.length);
    note = scaleNotes[noteIndex];
  }

  // Use custom octave range if provided, otherwise use weather-influenced range
  const octaveRange = customOctaveRange || {
    min: settings.minOctave,
    max: settings.maxOctave,
  };

  const octave =
    Math.floor(Math.random() * (octaveRange.max - octaveRange.min + 1)) +
    octaveRange.min;
  const midiNum = note + octave * 12 + 12; // MIDI note numbers start at C0 = 12

  // Velocity influenced by weather
  const velocity =
    Math.floor(
      Math.random() *
        (settings.velocityRange.max - settings.velocityRange.min + 1),
    ) + settings.velocityRange.min;

  // Duration influenced by weather
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
function generateChord(weather: WeatherData | null, numNotes = 3): Note[] {
  const settings = applyWeatherInfluence(weather);
  const scaleNotes = getScaleNotes();
  const rootIndex = Math.floor(Math.random() * scaleNotes.length);
  const rootNote = scaleNotes[rootIndex];

  const chordNotes: Note[] = [];

  // Adjust octave range based on weather
  const rootOctave =
    Math.floor(Math.random() * 3) + Math.max(2, settings.minOctave); // Weather-influenced octaves

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

  // Add other chord tones (using mixolydian-appropriate intervals)
  for (let i = 1; i < numNotes; i++) {
    // Prefer intervals that are common in mixolydian (2, 4, 5, 7, 10 - these are the 2nd, 3rd, 4th, 5th, and b7th degrees)
    const mixolydianIntervals = [2, 4, 5, 7, 10];
    const intervalIndex = Math.floor(Math.random() * mixolydianIntervals.length);
    const interval = mixolydianIntervals[intervalIndex];
    
    const nextNote = (rootNote + interval) % 12;
    const nextOctave = rootOctave + (nextNote < rootNote && interval > 6 ? 1 : 0);

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
function maybeChangeMusicalContext(): void {
  const now = Date.now();

  // Change approximately every 3-5 minutes
  if (now - lastModeChangeTime > 3 * 60 * 1000 && Math.random() < 0.01) {
    // For SF Streets, we want to maintain mixolydian mode but can change key
    const changeType = Math.floor(Math.random() * 2); // 0: change key, 1: change both but keep mixolydian

    if (changeType === 0) {
      // Change key only
      currentKey = Math.floor(Math.random() * 12);
    } else {
      // Change key but ensure scale stays mixolydian
      currentKey = Math.floor(Math.random() * 12);
      // 90% chance to stay in mixolydian mode
      if (Math.random() > 0.9) {
        // 10% chance to briefly use another mode before returning to mixolydian
        const otherScales: Scale[] = ["dorian", "phrygian", "lydian"];
        currentScale = otherScales[Math.floor(Math.random() * otherScales.length)];
        
        // Schedule a return to mixolydian after a short period (15-30 seconds)
        setTimeout(() => {
          currentScale = "mixolydian";
        }, 15000 + Math.random() * 15000);
      } else {
        currentScale = "mixolydian";
      }
    }

    lastModeChangeTime = now;
  }
}

// Track urban sound pattern variables
let trafficIntensity = 0.5; // 0-1 scale for traffic intensity
let lastTrafficChange = Date.now();
let windRhythmCounter = 0; // Counter for wind rhythm patterns
let conversationDensity = 0.2; // Reduced likelihood of conversation sounds (was 0.3)

// Helper function to gradually change traffic intensity (ebb and flow)
function updateTrafficIntensity(): number {
  const now = Date.now();
  
  // Update traffic intensity every 10-30 seconds to create ebb and flow
  if (now - lastTrafficChange > 10000 + Math.random() * 20000) {
    // Random walk with bounds
    trafficIntensity += (Math.random() * 0.4) - 0.2;
    // Keep within bounds
    trafficIntensity = Math.max(0.1, Math.min(0.9, trafficIntensity));
    lastTrafficChange = now;
  }
  
  return trafficIntensity;
}

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

// Generate wind sound pattern (constant and rhythmic)
function generateWindEffect(weather: WeatherData | null): Note[] {
  const settings = applyWeatherInfluence(weather);
  const windNotes: Note[] = [];
  
  // Wind uses lower register, consistent rhythm
  const windOctave = Math.floor(Math.random() * 2) + 1; // Lower register (1-2)
  
  // Use consistent rhythm - alternate between short and long notes
  const isLongNote = windRhythmCounter % 4 === 0; // Every 4th note is longer
  windRhythmCounter++;
  
  // Use specific notes for wind effect (chromatic clusters in low register)
  const baseNote = Math.floor(Math.random() * 4) * 2; // Even numbers only
  
  for (let i = 0; i < (isLongNote ? 1 : 2); i++) {
    const note = (baseNote + i) % 12;
    windNotes.push({
      name: NOTES[note],
      octave: windOctave,
      midiNumber: note + windOctave * 12 + 12,
      velocity: Math.floor(Math.random() * 20) + 30, // Quiet (30-50)
      duration: isLongNote ? 1200 : 300, // Longer sustain for rhythmic effect
    });
  }
  
  return windNotes;
}

// Generate traffic sound pattern (varies in intensity)
function generateTrafficEffect(weather: WeatherData | null): Note[] {
  const settings = applyWeatherInfluence(weather);
  const trafficNotes: Note[] = [];
  
  // Update traffic intensity to create ebb and flow
  const intensity = updateTrafficIntensity();
  
  // Traffic uses mid-low register with clusters
  const trafficOctave = 2 + Math.floor(Math.random() * 2); // Mid-low register (2-3)
  
  // Number of notes depends on current intensity
  const noteCount = Math.max(1, Math.floor(intensity * 5)); 
  
  for (let i = 0; i < noteCount; i++) {
    // Use clustered notes to represent traffic hum
    const note = Math.floor(Math.random() * 12);
    trafficNotes.push({
      name: NOTES[note],
      octave: trafficOctave,
      midiNumber: note + trafficOctave * 12 + 12,
      velocity: Math.floor(intensity * 60) + 40, // 40-100 based on intensity
      duration: 100 + Math.random() * intensity * 1000, // Varies with intensity
    });
  }
  
  return trafficNotes;
}

// Generate conversation sound pattern (sporadic, mid-high register, muffled)
function generateConversationEffect(weather: WeatherData | null): Note[] {
  const settings = applyWeatherInfluence(weather);
  const conversationNotes: Note[] = [];
  
  // Only generate conversation sometimes (sporadic snippets)
  if (Math.random() > conversationDensity) {
    return conversationNotes; // Empty array = no conversation this time
  }
  
  // Conversation uses mid-high register
  const conversationOctave = 4 + Math.floor(Math.random() * 2); // Mid-high register (4-5)
  
  // Generate fewer notes (1-4 instead of 2-5) to represent a sparser snippet of conversation
  const noteCount = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < noteCount; i++) {
    // Use serialist approach for note selection
    const note = getNextSerialNote();
    conversationNotes.push({
      name: NOTES[note],
      octave: conversationOctave,
      midiNumber: note + conversationOctave * 12 + 12,
      velocity: Math.floor(Math.random() * 20) + 40, // Quiet (40-60) for muffled effect
      duration: 100 + Math.random() * 300, // Short duration notes
    });
  }
  
  return conversationNotes;
}

// Main function to generate MIDI events
export function generateMidiEvent(
  weather: WeatherData | null = null,
): MidiEvent {
  _noteCounter++;
  maybeChangeMusicalContext();

  const settings = applyWeatherInfluence(weather);

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

  // Decide between note, chord, or counterpoint
  const eventType = Math.random();

  // For SF Streets soundscape, we want to generate a mix of urban sounds and musical elements
  if (eventType < 0.15) {
    // Wind effect - constant and rhythmic (reduced from 0.2)
    return {
      type: "counterpoint", // Reusing counterpoint for wind effect
      notes: generateWindEffect(weather),
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else if (eventType < 0.25) {
    // Traffic effect - ebbs and flows (reduced from 0.35)
    return {
      type: "chord", // Reusing chord for traffic effect
      notes: generateTrafficEffect(weather),
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else if (eventType < 0.35) {
    // Conversation effect - muffled snippets (reduced from 0.45)
    const conversationNotes = generateConversationEffect(weather);
    if (conversationNotes.length === 0) {
      // No conversation this time, fall back to regular note
      return {
        type: "note",
        note: generateRandomNote(weather),
        currentKey: NOTES[currentKey],
        currentScale,
      };
    }
    return {
      type: "counterpoint", // Reusing counterpoint for conversation snippets
      notes: conversationNotes,
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else if (eventType < 0.7) {
    // Generate a single note
    return {
      type: "note",
      note: generateRandomNote(weather),
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else if (eventType < 0.8) {
    // Generate a chord
    const chordSize = Math.floor(Math.random() * 3) + 3; // 3-5 notes
    return {
      type: "chord",
      notes: generateChord(weather, chordSize),
      currentKey: NOTES[currentKey],
      currentScale,
    };
  } else {
    // Generate counterpoint (2-4 notes across different registers)
    const numVoices = Math.floor(Math.random() * 3) + 2; // 2-4 voices
    const notes: Note[] = [];

    for (let i = 0; i < numVoices; i++) {
      // Assign each voice to a different register, influenced by weather
      const settings = applyWeatherInfluence(weather);
      const range = Math.min(settings.maxOctave - settings.minOctave, 5);
      const segment = range / numVoices;
      const minOctave = Math.max(
        settings.minOctave,
        Math.floor(settings.minOctave + i * segment),
      );
      const maxOctave = Math.min(
        settings.maxOctave,
        Math.ceil(settings.minOctave + (i + 1) * segment),
      );

      notes.push(
        generateRandomNote(weather, { min: minOctave, max: maxOctave }),
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
