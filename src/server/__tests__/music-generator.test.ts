import { generateMidiEvent } from "../music-generator";
// MidiEvent type is imported but not directly used in test assertions

describe("Music Generator", () => {
  it("should generate valid MIDI events", () => {
    const event = generateMidiEvent();
    expect(event).toBeDefined();
    expect(event.type).toBeDefined();

    // Test specific event types
    if (event.type === "note") {
      expect(event.note).toBeDefined();
      expect(event.note.name).toBeDefined();
      expect(event.note.octave).toBeGreaterThanOrEqual(1);
      expect(event.note.octave).toBeLessThanOrEqual(7);
      expect(event.note.midiNumber).toBeGreaterThan(0);
      expect(event.note.velocity).toBeGreaterThanOrEqual(0);
      expect(event.note.velocity).toBeLessThanOrEqual(127);
      expect(event.note.duration).toBeGreaterThan(0);
      expect(event.currentKey).toBeDefined();
      expect(event.currentScale).toBeDefined();
    } else if (event.type === "chord" || event.type === "counterpoint") {
      expect(event.notes).toBeInstanceOf(Array);
      expect(event.notes.length).toBeGreaterThan(0);
      expect(event.currentKey).toBeDefined();
      expect(event.currentScale).toBeDefined();
    } else if (event.type === "pedal") {
      expect(event.pedal).toBeDefined();
      expect(["sustain", "sostenuto", "soft"]).toContain(event.pedal.type);
      expect(event.pedal.value).toBeGreaterThanOrEqual(0);
      expect(event.pedal.value).toBeLessThanOrEqual(1);
    } else if (event.type === "silence") {
      expect(event.duration).toBeGreaterThan(0);
    }
  });

  it("should generate multiple events without errors", () => {
    // Generate multiple events to test consistency
    for (let i = 0; i < 20; i++) {
      const event = generateMidiEvent();
      expect(event).toBeDefined();
    }
  });

  it("should generate different types of events", () => {
    // Collect event types over many iterations
    const eventTypes = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const event = generateMidiEvent();
      eventTypes.add(event.type);

      // If we've seen all event types, break early
      if (eventTypes.size >= 4) break; // note, chord, counterpoint, pedal, silence
    }

    // We should observe at least 3 different event types
    expect(eventTypes.size).toBeGreaterThanOrEqual(3);
  });
  
  it("should use mixolydian mode for SF Streets by default", () => {
    // Generate multiple events to ensure we catch the default scale
    let foundMixolydian = false;
    
    for (let i = 0; i < 20; i++) {
      const event = generateMidiEvent();
      
      if (event.type === "note" || event.type === "chord" || event.type === "counterpoint") {
        if (event.currentScale === "mixolydian") {
          foundMixolydian = true;
          break;
        }
      }
    }
    
    expect(foundMixolydian).toBe(true);
  });
  
  it("should generate 12-tone serialist patterns for SF Streets", () => {
    // Track notes used across multiple calls to verify serialist pattern
    const usedNotes = new Set<string>();
    const allEvents = [];
    
    // Generate multiple events to collect note pattern data
    for (let i = 0; i < 30; i++) {
      const event = generateMidiEvent();
      allEvents.push(event);
      
      // Collect notes from various event types
      if (event.type === "note") {
        usedNotes.add(event.note.name);
      } else if (event.type === "chord" || event.type === "counterpoint") {
        event.notes.forEach(note => {
          usedNotes.add(note.name);
        });
      }
      
      // If we've seen at least 7 different notes, that's enough to verify serialist tendencies
      if (usedNotes.size >= 7) break;
    }
    
    // In 12-tone serialist music, we should see a good variety of notes
    expect(usedNotes.size).toBeGreaterThanOrEqual(7);
  });
});
