import { MusicStateEvent, musicState } from "../shared/music-state";
import { Note, WeatherData } from "../shared/types";

// Use the shared music state service
const socket = musicState.getSocket();

// DOM elements
const startButton = document.getElementById("start-btn") as HTMLButtonElement;
const stopButton = document.getElementById("stop-btn") as HTMLButtonElement;
const outputSelect = document.getElementById(
  "output-select",
) as HTMLSelectElement;
const micButton = document.getElementById("mic-btn") as HTMLButtonElement;
const visualization = document.getElementById(
  "visualization",
) as HTMLDivElement;
const currentKeyDisplay = document.getElementById("current-key") as HTMLElement;
const currentScaleDisplay = document.getElementById(
  "current-scale",
) as HTMLElement;
const notesPlayingDisplay = document.getElementById(
  "notes-playing",
) as HTMLElement;
const pedalsStatusDisplay = document.getElementById(
  "pedals-status",
) as HTMLElement;
const weatherInfoDisplay = document.getElementById(
  "weather-info",
) as HTMLElement;
const weatherImpactDisplay = document.getElementById(
  "weather-impact",
) as HTMLElement;
const micStatusDisplay = document.getElementById("mic-status") as HTMLElement;
const micFrequenciesDisplay = document.getElementById(
  "mic-frequencies",
) as HTMLElement;
const consoleOutput = document.getElementById("console-output") as HTMLElement;

// AudioContext and MIDI
let audioContext: AudioContext | null = null;
let gainNode: GainNode | null = null;
let midiOutput: WebMidi.MIDIOutput | null = null;
let microphoneStream: MediaStream | null = null;
let microphoneSource: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let microphoneActive = false;
let microphoneAnalysisInterval: number | null = null;
const activeNotes: Map<
  number,
  { oscillator: OscillatorNode; gainNode: GainNode; endTime: number }
> = new Map();

// Pedal status (reference from shared state)
const pedalStatus = musicState.getPedalStatus();

// Weather state
let weatherUpdateInterval: number | null = null;
const WEATHER_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Initialize audio
function initAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5;
    gainNode.connect(audioContext.destination);
    logToConsole("Audio initialized");
  }
}

// Initialize microphone
async function toggleMicrophone() {
  initAudio();
  if (!audioContext) return;

  if (!microphoneActive) {
    try {
      // Request microphone access
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      // Create source and analyzer
      microphoneSource = audioContext.createMediaStreamSource(microphoneStream);
      analyser = audioContext.createAnalyser();

      // Configure analyzer
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      // Connect microphone source to analyzer
      microphoneSource.connect(analyser);

      // Start microphone analysis
      microphoneActive = true;
      micButton.textContent = "MIC: ON";
      micStatusDisplay.textContent = "Active";
      logToConsole("Microphone activated");

      // Start regular analysis
      startMicrophoneAnalysis();
    } catch (error) {
      logToConsole(`Error accessing microphone: ${error}`);
      micStatusDisplay.textContent = `Error: ${error}`;
    }
  } else {
    // Stop microphone
    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop());
      microphoneStream = null;
    }
    if (microphoneSource) {
      microphoneSource.disconnect();
      microphoneSource = null;
    }
    if (microphoneAnalysisInterval !== null) {
      clearInterval(microphoneAnalysisInterval);
      microphoneAnalysisInterval = null;
    }

    microphoneActive = false;
    micButton.textContent = "MIC: OFF";
    micStatusDisplay.textContent = "Inactive";
    micFrequenciesDisplay.textContent = "--";
    logToConsole("Microphone deactivated");

    // Send empty microphone data to server
    musicState.setMicrophoneData({
      volume: 0,
      dominantFrequencies: [],
      isActive: false,
    });
  }
}

// Start analyzing microphone input at regular intervals
function startMicrophoneAnalysis() {
  if (microphoneAnalysisInterval !== null) {
    clearInterval(microphoneAnalysisInterval);
  }

  microphoneAnalysisInterval = window.setInterval(() => {
    analyzeAudio();
  }, 100); // Analyze every 100ms
}

// Analyze audio from microphone
function analyzeAudio() {
  if (!analyser || !microphoneActive) return;

  // Get frequency data
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Calculate overall volume (0-1)
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const volume = sum / (bufferLength * 255); // Normalize to 0-1

  // Find dominant frequencies
  const dominantFrequencies = findDominantFrequencies(dataArray, 3);

  // Update UI
  updateMicrophoneDisplay(volume, dominantFrequencies);

  // Send data to music state
  musicState.setMicrophoneData({
    volume,
    dominantFrequencies,
    isActive: true,
  });
}

// Find N dominant frequencies in the spectrum
function findDominantFrequencies(
  dataArray: Uint8Array,
  count: number,
): number[] {
  if (!analyser) return [];

  const sampleRate = audioContext?.sampleRate || 44100;
  const binCount = analyser.frequencyBinCount;
  const freqResolution = sampleRate / (2 * binCount); // Hz per bin

  // Create array of [index, value] pairs
  const pairs = Array.from(dataArray).map((value, index) => [index, value]);

  // Sort by value (amplitude) in descending order
  pairs.sort((a, b) => b[1] - a[1]);

  // Take the top N frequencies, convert indices to frequency values
  return pairs
    .slice(0, count)
    .filter((pair) => pair[1] > 30) // Only consider frequencies with significant amplitude
    .map((pair) => Math.round(pair[0] * freqResolution));
}

// Update microphone display
function updateMicrophoneDisplay(volume: number, frequencies: number[]) {
  const volumePercent = Math.round(volume * 100);
  micStatusDisplay.textContent = `Volume: ${volumePercent}%`;

  if (frequencies.length > 0) {
    micFrequenciesDisplay.textContent = frequencies
      .map((f) => `${f} Hz`)
      .join(", ");
  } else {
    micFrequenciesDisplay.textContent = "None detected";
  }
}

// Initialize MIDI
async function initMidi() {
  try {
    if (navigator.requestMIDIAccess) {
      const midiAccess = await navigator.requestMIDIAccess();
      const outputs = Array.from(midiAccess.outputs.values());

      // Get the first available MIDI output
      const output = outputs.length > 0 ? outputs[0] : null;
      if (output) {
        midiOutput = output;
        logToConsole(`MIDI output selected: ${midiOutput.name}`);
        return true;
      } else {
        logToConsole("No MIDI outputs available");
        return false;
      }
    } else {
      logToConsole("WebMIDI not supported in this browser");
      return false;
    }
  } catch (error) {
    logToConsole(`Error initializing MIDI: ${error}`);
    return false;
  }
}

// Get user's location using the Geolocation API
async function getUserLocation(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      logToConsole("Geolocation not supported in this browser");
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        logToConsole(`Geolocation error: ${error.message}`);
        resolve(null);
      },
      { timeout: 10000 },
    );
  });
}

// Fetch weather data from Open-Meteo API
async function fetchWeatherData(
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`,
    );

    if (!response.ok) {
      throw new Error(
        `Weather API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Map the weather code to a description
    const weatherDescription = getWeatherDescription(data.current.weather_code);

    return {
      temperature: data.current.temperature_2m,
      weatherCode: data.current.weather_code,
      weatherDescription,
    };
  } catch (error) {
    logToConsole(`Error fetching weather: ${error}`);
    return null;
  }
}

// Get weather description from code based on WMO codes
function getWeatherDescription(code: number): string {
  // WMO Weather interpretation codes (WW)
  const weatherCodes: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };

  return weatherCodes[code] || "Unknown";
}

// Update weather info in UI
function updateWeatherDisplay(weather: WeatherData) {
  console.log(
    `Updating weather display: ${weather.temperature}°C, ${weather.weatherDescription}`,
  );

  try {
    // Use innerHTML which is more reliable across browsers than textContent
    weatherInfoDisplay.innerHTML = `${weather.temperature}°C, ${weather.weatherDescription}`;

    // Update weather impact description
    updateWeatherImpactDisplay(weather);

    // Force a layout recalculation in Edge (helps with rendering issues)
    weatherInfoDisplay.style.display = "none";
    weatherInfoDisplay.offsetHeight; // Force a reflow
    weatherInfoDisplay.style.display = "";
  } catch (error) {
    console.error("Error updating weather display:", error);
  }
}

// Update weather impact description in UI
function updateWeatherImpactDisplay(weather: WeatherData) {
  const impact = [];

  // Temperature impact
  if (weather.temperature < 0) {
    impact.push("Slower tempo, lower register");
  } else if (weather.temperature < 10) {
    impact.push("Minor scales, softer dynamics");
  } else if (weather.temperature > 25) {
    impact.push("Brighter scales, higher register");
  } else if (weather.temperature > 30) {
    impact.push("Faster tempo, more activity");
  }

  // Weather condition impact
  const code = weather.weatherCode;
  if ([0, 1].includes(code)) {
    // Clear
    impact.push("Sparse, bright notes");
  } else if ([2, 3].includes(code)) {
    // Cloudy
    impact.push("Varied dynamics, moderate activity");
  } else if (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)
  ) {
    // Rain
    impact.push("More sustain pedal, softer attacks");
  } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
    // Snow
    impact.push("Slower, gentler passages");
  } else if ([95, 96, 99].includes(code)) {
    // Thunderstorm
    impact.push("Dramatic dynamics, cluster chords");
  }

  weatherImpactDisplay.textContent = impact.join(", ");
}

// Initialize weather updates
async function initWeatherUpdates() {
  // Stop any existing interval
  if (weatherUpdateInterval !== null) {
    clearInterval(weatherUpdateInterval);
  }

  // First update
  await updateWeather();

  // Set interval for updates
  weatherUpdateInterval = window.setInterval(
    updateWeather,
    WEATHER_UPDATE_INTERVAL,
  );
}

// Update weather and send to server
async function updateWeather() {
  const location = await getUserLocation();
  if (!location) {
    return;
  }

  const weatherData = await fetchWeatherData(
    location.latitude,
    location.longitude,
  );
  if (!weatherData) {
    return;
  }

  // Update shared weather state
  musicState.setWeatherData(weatherData);

  // Update UI
  updateWeatherDisplay(weatherData);

  logToConsole(
    `Weather updated: ${weatherData.temperature}°C, ${weatherData.weatherDescription}`,
  );

  return weatherData;
}

// Play a note using Web Audio API
function playNote(note: Note) {
  if (!audioContext || !gainNode) initAudio();
  if (!audioContext || !gainNode) return;

  const now = audioContext.currentTime;
  const pedals = musicState.getPedalStatus();

  // Create oscillator
  const oscillator = audioContext.createOscillator();
  oscillator.type = "sine"; // Piano-like sound
  oscillator.frequency.value = midiToFrequency(note.midiNumber);

  // Create note-specific gain node for envelope
  const noteGain = audioContext.createGain();
  noteGain.gain.value = 0;

  // Connect nodes
  oscillator.connect(noteGain);
  noteGain.connect(gainNode);

  // Apply envelope
  const velocityGain = note.velocity / 127;
  const attackTime = 0.01;
  const releaseTime = 0.3;

  // Attack
  noteGain.gain.setValueAtTime(0, now);
  noteGain.gain.linearRampToValueAtTime(velocityGain, now + attackTime);

  // Calculate end time based on sustain pedal
  const sustainMultiplier = pedals.sustain > 0.5 ? 3 : 1;
  const noteDuration = (note.duration / 1000) * sustainMultiplier;
  const endTime = now + noteDuration;

  // Release
  noteGain.gain.setValueAtTime(velocityGain, endTime - releaseTime);
  noteGain.gain.linearRampToValueAtTime(0, endTime);

  // Start and schedule stop
  oscillator.start(now);
  oscillator.stop(endTime + 0.1);

  // Store active note
  activeNotes.set(note.midiNumber, {
    oscillator,
    gainNode: noteGain,
    endTime: endTime,
  });

  // Schedule cleanup
  setTimeout(
    () => {
      activeNotes.delete(note.midiNumber);
    },
    (noteDuration + 0.2) * 1000,
  );

  // Create visualization element
  createNoteVisualization(note);
}

// Play a note using MIDI output
function playMidiNote(note: Note) {
  if (!midiOutput) return;

  // NoteOn message
  midiOutput.send([0x90, note.midiNumber, note.velocity]);

  // Schedule NoteOff
  setTimeout(() => {
    midiOutput?.send([0x80, note.midiNumber, 0]);
  }, note.duration);

  // Create visualization element
  createNoteVisualization(note);
}

// Stop all notes
function stopAllNotes() {
  // Stop Web Audio notes
  if (audioContext) {
    activeNotes.forEach(({ oscillator, gainNode }) => {
      const now = audioContext!.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
      setTimeout(() => oscillator.stop(), 200);
    });
    activeNotes.clear();
  }

  // Stop MIDI notes
  if (midiOutput) {
    // Send All Notes Off message
    midiOutput.send([0xb0, 123, 0]);

    // Send Note Off messages for all possible MIDI notes (0-127)
    // This ensures any stuck notes are definitely turned off
    for (let i = 0; i < 128; i++) {
      midiOutput.send([0x80, i, 0]); // Note Off for each MIDI note
    }
  }

  // Reset all pedals to 0
  resetAllPedals();

  // Clear notes playing display
  notesPlayingDisplay.textContent = "--";

  // Clear visualization
  visualization.innerHTML = "";
}

// Reset all pedals to 0
function resetAllPedals() {
  // Reset pedal status
  pedalStatus.sustain = 0;
  pedalStatus.sostenuto = 0;
  pedalStatus.soft = 0;

  // Send MIDI messages to reset pedals
  if (midiOutput) {
    // Reset sustain pedal
    midiOutput.send([0xb0, 64, 0]);
    // Reset sostenuto pedal
    midiOutput.send([0xb0, 66, 0]);
    // Reset soft pedal
    midiOutput.send([0xb0, 67, 0]);
  }

  // Update pedal display
  updatePedalDisplay();
}

// Removed unused function handlePedal

// Create visualization for a note
function createNoteVisualization(note: Note) {
  const noteElement = document.createElement("div");
  noteElement.className = "note-block";
  noteElement.textContent = `${note.name}${note.octave}`;

  // Set width based on duration
  const width = Math.max(30, Math.min(200, note.duration / 50));
  noteElement.style.width = `${width}px`;

  // Set color intensity based on velocity
  const intensity = Math.floor((note.velocity / 127) * 100);

  // Modify color based on weather if available
  let hue = 120; // Default green
  const currentWeather = musicState.getWeatherData();
  if (currentWeather) {
    // Adjust hue based on temperature: colder = blue (240), hotter = red (0)
    if (currentWeather.temperature < 0) {
      hue = 240; // Blue for very cold
    } else if (currentWeather.temperature < 10) {
      hue = 180; // Cyan for cool
    } else if (currentWeather.temperature > 30) {
      hue = 0; // Red for very hot
    } else if (currentWeather.temperature > 25) {
      hue = 60; // Yellow for warm
    }

    // Adjust saturation based on weather conditions
    if (
      [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(
        currentWeather.weatherCode,
      )
    ) {
      // Rainy conditions, more blue
      hue = Math.max(hue, 180);
    } else if ([95, 96, 99].includes(currentWeather.weatherCode)) {
      // Stormy conditions, more purple
      hue = 270;
    }
  }

  noteElement.style.backgroundColor = `hsl(${hue}, 100%, ${intensity}%)`;

  visualization.appendChild(noteElement);

  // Remove after duration
  setTimeout(() => {
    noteElement.remove();
  }, note.duration);

  // Update notes playing display
  updateNotesPlayingDisplay();
}

// Update pedal display
function updatePedalDisplay() {
  const pedals = [];
  const pedalStatus = musicState.getPedalStatus();

  if (pedalStatus.sustain > 0) {
    pedals.push(`SUSTAIN: ${Math.floor(pedalStatus.sustain * 100)}%`);
  }
  if (pedalStatus.sostenuto > 0) {
    pedals.push(`SOSTENUTO: ${Math.floor(pedalStatus.sostenuto * 100)}%`);
  }
  if (pedalStatus.soft > 0) {
    pedals.push(`SOFT: ${Math.floor(pedalStatus.soft * 100)}%`);
  }

  pedalsStatusDisplay.textContent =
    pedals.length > 0 ? pedals.join(", ") : "--";
}

// Update notes playing display
function updateNotesPlayingDisplay() {
  const notesPlaying = musicState.getNotesPlaying();

  if (notesPlaying.length > 0) {
    const noteNames = notesPlaying
      .map((n) => `${n.name}${n.octave}`)
      .join(", ");
    notesPlayingDisplay.textContent = noteNames;
  } else {
    notesPlayingDisplay.textContent = "--";
  }
}

// Convert MIDI note number to frequency
function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Log message to console
function logToConsole(message: string) {
  const timestamp = new Date().toISOString().substring(11, 19);
  consoleOutput.innerHTML += `[${timestamp}] ${message}\n`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Subscribe to music state events
musicState.subscribe((event: MusicStateEvent) => {
  const output = outputSelect.value;

  switch (event.type) {
    case "notes-updated":
      // Update UI with current notes
      updateNotesPlayingDisplay();

      // Play the latest notes
      const notes = musicState.getNotesPlaying();
      if (notes.length > 0) {
        // Find the most recently added notes (ones with the highest _startTime)
        const now = Date.now();
        const recentNotes = notes.filter(
          (note) => (note._startTime || 0) > now - 50,
        );

        recentNotes.forEach((note) => {
          // Play the note using selected output
          if (output === "browser") {
            playNote(note);
          } else if (output === "midi" && midiOutput) {
            playMidiNote(note);
          }

          if (recentNotes.length === 1) {
            logToConsole(`Playing note: ${note.name}${note.octave}`);
          }
        });

        if (recentNotes.length > 1) {
          logToConsole(`Playing ${recentNotes.length} notes`);
        }
      }
      break;

    case "key-updated":
      // Update key and scale display
      currentKeyDisplay.textContent = musicState.getCurrentKey();
      currentScaleDisplay.textContent = musicState.getCurrentScale();
      break;

    case "pedals-updated":
      // Update pedal display
      updatePedalDisplay();

      // Handle MIDI pedal updates
      const pedals = musicState.getPedalStatus();
      if (midiOutput) {
        // Send MIDI CC messages for pedals
        midiOutput.send([0xb0, 64, Math.floor(pedals.sustain * 127)]);
        midiOutput.send([0xb0, 66, Math.floor(pedals.sostenuto * 127)]);
        midiOutput.send([0xb0, 67, Math.floor(pedals.soft * 127)]);
      }

      logToConsole(`Pedal status updated`);
      break;

    case "weather-updated":
      // Update weather display
      const weatherData = musicState.getWeatherData();
      if (weatherData) {
        updateWeatherDisplay(weatherData);
      }
      break;

    case "all-notes-off":
      // Stop all notes
      stopAllNotes();
      logToConsole("All notes off");
      break;
  }
});

// Socket connection events
socket.on("connect", () => {
  logToConsole("Connected to server");
});

socket.on("disconnect", () => {
  logToConsole("Disconnected from server");
  // Clear weather update interval on disconnect
  if (weatherUpdateInterval !== null) {
    clearInterval(weatherUpdateInterval);
    weatherUpdateInterval = null;
  }
});

// Event listeners
startButton.addEventListener("click", async () => {
  initAudio();

  // Initialize weather before starting
  await initWeatherUpdates();

  if (outputSelect.value === "midi") {
    initMidi().then((success) => {
      if (success) {
        musicState.start();
        logToConsole("Starting MIDI stream - MIDI output");
      } else {
        outputSelect.value = "browser";
        musicState.start();
        logToConsole("MIDI not available, falling back to browser audio");
      }
    });
  } else {
    musicState.start();
    logToConsole("Starting MIDI stream - Browser audio");
  }
});

stopButton.addEventListener("click", () => {
  musicState.stop();
  logToConsole("Stopping MIDI stream");
});

micButton.addEventListener("click", () => {
  toggleMicrophone();
});

outputSelect.addEventListener("change", () => {
  if (outputSelect.value === "midi") {
    initMidi().then((success) => {
      if (!success) {
        outputSelect.value = "browser";
        logToConsole("MIDI not available, falling back to browser audio");
      }
    });
  }
});

// Cleanup function
window.addEventListener("beforeunload", () => {
  socket.emit("stop");
  stopAllNotes();
  if (weatherUpdateInterval !== null) {
    clearInterval(weatherUpdateInterval);
  }
  if (microphoneStream) {
    microphoneStream.getTracks().forEach((track) => track.stop());
  }
  if (microphoneAnalysisInterval !== null) {
    clearInterval(microphoneAnalysisInterval);
  }
});

// Initialization
logToConsole("Player Piano initialized");
logToConsole("Click START to begin playing");

// Check for any existing weather data at startup (especially for Edge browser)
setTimeout(() => {
  const existingWeather = musicState.getWeatherData();
  if (existingWeather) {
    logToConsole("Using existing weather data at startup");
    updateWeatherDisplay(existingWeather);
  } else {
    logToConsole("No weather data available at startup");
    // Request weather data from server if another client might have sent it
    socket.emit("request-weather-data");
  }
}, 1000);

// Add missing property to Note interface for tracking
declare module "../shared/types" {
  interface Note {
    _startTime?: number;
  }
}

// Extend the Navigator interface with MIDI methods
declare global {
  interface Navigator {
    requestMIDIAccess(): Promise<WebMidi.MIDIAccess>;
  }
}
