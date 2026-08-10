/* ==========================================================================
   The ear.

   The microphone, and the two questions worth asking of it: what note is this
   string, and what chord is this. Nothing in here knows what a song is, what
   is drawn on the page, or that there is a page at all. It hands back numbers
   and app.js decides what to do with them, which is the whole reason it is a
   file of its own: this is signal processing and that is an app, and the two
   fail in completely different ways.

   THE TWO QUESTIONS ARE NOT THE SAME QUESTION and they are not answered by
   the same arithmetic.

     A NOTE is one string, one pitch, and a waveform that repeats. It is found
     in the TIME the sound came in, by looking for the delay at which the wave
     most nearly repeats itself (see note below). That is a solved problem and
     the answer is exact to a couple of cents, which is why a tuner is a tuner
     and not a guess.

     A CHORD is six strings at once, each with a stack of harmonics over it,
     and there is no single pitch in there to find. So it is found in the
     FREQUENCIES instead: how much of each of the twelve notes is sounding,
     regardless of octave, and which chord that pattern looks most like. That
     is not a solved problem. It is a good guess in a quiet room with one
     guitar and it is a poor one with a band playing.

   WHAT THE BROWSER DOES TO A MICROPHONE HAS TO BE TURNED OFF. Echo
   cancellation, noise suppression and automatic gain are tuned for a voice on
   a call: they treat a sustained harmonic tone as noise, and they will quietly
   ruin every number below. See RAW.

   No worklet and no second thread. An AnalyserNode already does its window on
   the audio thread and hands over the result; what is left here is a few
   hundred multiplications per frame, which is nothing.
   ========================================================================== */
(function () {
  "use strict";

  /* --- what a microphone is asked for --------------------------------------
     Everything the browser would helpfully do, refused. The three flags are
     the difference between a signal and a smear, and `channelCount` is only
     honesty: everything below mixes to mono anyway. */
  var RAW = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };

  var ctx = null;
  var stream = null;
  /* Two windows on the same sound, because the two questions want opposite
     things from a window. Long is precise about frequency and vague about
     when; short is the other way about. So the chord gets the long one and the
     note gets the short one, and neither has to compromise for the other. */
  var wide = null;
  var tight = null;

  var spec = null;   /* the long window, as decibels per bin */
  var wave = null;   /* the short window, as samples */

  var opening = null;
  var users = 0;

  /* --- the sound is quiet, and how quiet -----------------------------------
     Under this there is nothing to answer about, and answering anyway is how
     a tuner ends up naming the room. */
  var HUSH = 0.004;

  function live() {
    return !!ctx;
  }

  /* Asked from a press and never before it: a browser will not hand over a
     microphone without a gesture, and an AudioContext made outside one starts
     suspended on iOS and stays that way.

     COUNTED, because two panels may want the same microphone and the second
     one closing must not take it from the first. */
  function open() {
    users++;
    if (opening) return opening;

    opening = navigator.mediaDevices.getUserMedia({ audio: RAW })
      /* A device that cannot do one of the three flags refuses the whole
         request rather than doing its best, so the fallback is to ask for a
         microphone at all. The numbers will be worse and there is nothing to
         be done about that; no microphone at all is worse still. */
      .catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); })
      .then(function (got) {
        stream = got;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctx();
        if (ctx.state === "suspended" && ctx.resume) ctx.resume();

        var source = ctx.createMediaStreamSource(stream);

        /* THE LONG WINDOW, AND ITS LENGTH IS A LAG. 8192 samples is 170
           milliseconds at 48kHz, and for the whole of those 170 milliseconds
           after a chord is struck the reading still holds the chord before it.
           That wait is the largest single part of how long the mark on the song
           takes to move, which is the one thing a player actually feels.

           It was 16384, twice this, and the reason was the bottom of the
           instrument: there the bins are three hertz apart and E2 and F2 are
           five, so the two lowest notes on a guitar land in bins of their own,
           and at 8192 the bins are six apart and those two share one.

           WHICH COSTS FAR LESS THAN IT SOUNDS, because a note is not read off
           one bin (see salience). It is read off its own pitch and the first
           three multiples of it, and by the third of those E and F are fifteen
           hertz apart and plainly different. And the twelve numbers fold every
           octave together, so the same E is measured again in the middle of the
           instrument, where nothing is ambiguous at all. One pair of low
           fundamentals is blurred. The chord is not.

           Half the smear for a blur at the bottom of one octave is the right
           way round for a page that has to keep up with the playing. */
        wide = ctx.createAnalyser();
        wide.fftSize = 8192;
        /* And little smoothing, for the same reason. The window is already most
           of the averaging, and every bit of this is another few milliseconds of
           the old chord kept alive underneath the new one. */
        wide.smoothingTimeConstant = 0.2;
        wide.minDecibels = -110;
        wide.maxDecibels = -10;

        /* THE SHORT ONE, and short is what a tuner wants: a needle that
           answers a third of a second after the string was plucked is a
           needle nobody can tune against. 2048 samples is 43 milliseconds and
           holds three periods of the lowest note anybody points a tuner at,
           which is all the arithmetic below needs. */
        tight = ctx.createAnalyser();
        tight.fftSize = 2048;
        tight.smoothingTimeConstant = 0;

        source.connect(wide);
        source.connect(tight);
        /* AND NEITHER OF THEM REACHES THE SPEAKERS. An analyser is a tap and
           not a stage in a chain: connecting one onwards would put the
           microphone through the speakers, which is a howl. */

        spec = new Float32Array(wide.frequencyBinCount);
        wave = new Float32Array(tight.fftSize);
        plan();
        return true;
      })
      .catch(function (err) {
        /* Cleared, so the next press asks again. A refusal that is remembered
           is a button that has stopped working for the rest of the tab, and
           somebody who said no by accident has no way back. */
        users = 0;
        opening = null;
        shut();
        throw err;
      });

    return opening;
  }

  function close() {
    users--;
    if (users > 0) return;
    users = 0;
    opening = null;
    shut();
  }

  function shut() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (ctx && ctx.close) ctx.close();
    ctx = null; stream = null; wide = null; tight = null; spec = null; wave = null;
  }

  /* --- how loud, which is asked before anything else ------------------------ */
  function loudness() {
    tight.getFloatTimeDomainData(wave);
    var sum = 0;
    for (var i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    return Math.sqrt(sum / wave.length);
  }

  /* ==========================================================================
     ONE NOTE, FOUND IN THE TIME.

     A plucked string makes a wave that repeats. So the pitch is the delay at
     which the sound most nearly equals itself, and finding it is a matter of
     sliding the recording over itself and asking how different the two are.

     This is YIN, which is that idea with the two corrections that make it
     work on a guitar. The first is dividing by the running average, so that
     the answer stops being "a delay of nothing is a perfect match"; the second
     is taking the FIRST delay good enough rather than the best one, which is
     what stops it answering an octave too low, because twice a period is
     always as good a match as the period.
     ========================================================================== */

  /* Scratch, allocated once. A Float32Array per frame is a Float32Array per
     frame for the garbage collector to deal with, twenty times a second. */
  var diff = new Float32Array(1100);
  var norm = new Float32Array(1100);

  /* Good enough to stop looking. Lower is fussier and misses quiet notes;
     higher answers confidently about a chair scraping. */
  var SURE = 0.12;
  /* And past this there is no note in the room, whatever the best delay was. */
  var GIVE_UP = 0.45;

  function note() {
    var out = { rms: 0, hz: 0, midi: 0, cents: 0, clarity: 0 };
    if (!ctx) return out;

    out.rms = loudness();
    if (out.rms < HUSH) return out;

    var sr = ctx.sampleRate;
    var W = 1024;
    /* Down to 65Hz, which is under the bottom string of a guitar and under a
       bass's G, and up to 1400, which is over anything anybody tunes. */
    var top = Math.min(Math.floor(sr / 65), wave.length - W, norm.length - 2);
    var low = Math.max(2, Math.floor(sr / 1400));

    /* How different the sound is from itself, delay by delay. */
    var tau, j, d, sum;
    for (tau = 1; tau < top; tau++) {
      sum = 0;
      for (j = 0; j < W; j++) {
        d = wave[j] - wave[j + tau];
        sum += d * d;
      }
      diff[tau] = sum;
    }

    /* Divided by the running average of everything shorter, which is what
       turns "how different" into "how much better than usual". Without it the
       smallest difference is always at no delay at all. */
    var run = 0;
    norm[0] = 1;
    for (tau = 1; tau < top; tau++) {
      run += diff[tau];
      norm[tau] = run > 0 ? diff[tau] * tau / run : 1;
    }

    /* The FIRST dip under the line, not the deepest. Twice a period matches
       as well as a period does, so a search for the best answer finds the
       octave below about as often as the note. */
    var at = -1;
    for (tau = low; tau < top - 1; tau++) {
      if (norm[tau] < SURE) {
        while (tau + 1 < top && norm[tau + 1] < norm[tau]) tau++;
        at = tau;
        break;
      }
    }
    if (at < 0) {
      /* Nothing was clean enough, so take the best there was and let the
         caller see how poor it is. A quiet, badly-lit note is still a note,
         and refusing to name it at all is a tuner that goes blank exactly when
         somebody plays softly. */
      var best = GIVE_UP;
      for (tau = low; tau < top; tau++) {
        if (norm[tau] < best) { best = norm[tau]; at = tau; }
      }
      if (at < 0) return out;
    }

    /* The dip falls between two samples, and a whole number of samples is
       four cents wide up at the top string. So a parabola through the dip and
       its two neighbours, and the delay is where that parabola bottoms out. */
    var a = norm[at - 1], b = norm[at], c = norm[at + 1];
    var bend = a + c - 2 * b;
    var exact = bend > 0 ? at + (a - c) / (2 * bend) : at;

    out.clarity = 1 - Math.min(1, b);
    out.hz = sr / exact;
    out.midi = 69 + 12 * Math.log(out.hz / 440) / Math.LN2;
    out.cents = (out.midi - Math.round(out.midi)) * 100;
    return out;
  }

  /* ==========================================================================
     A CHORD, FOUND IN THE FREQUENCIES.

     Twelve numbers, one per note name, each saying how much of that note is
     sounding anywhere on the instrument. Then: which chord does that pattern
     look most like.

     WHAT MAKES IT HARD IS THE HARMONICS. A single C on a guitar puts energy
     on C, on the C above, on the G above that and on the E above that, so a C
     alone already looks a little like a C major chord and a lot like the note
     G. Reading the spectrum straight into twelve buckets hands those overtones
     over at full strength, and the classic result is that C major and A minor,
     which share two notes out of three to begin with, become indistinguishable.

     So a note is not read off one bin. It is asked for as EVIDENCE: energy at
     its own pitch and at the first few multiples of it, added up with falling
     weight. A real C has all four and scores; the G that only exists as C's
     third harmonic has one out of four and mostly does not.
     ========================================================================== */

  /* E2 to E6, which is a guitar with a capo high up, and a piano's middle. */
  var LOW_NOTE = 40;
  var HIGH_NOTE = 88;
  var HARMONICS = [1, 0.55, 0.35, 0.22];

  /* The bass is asked separately and over a narrower range, because the note
     at the bottom of a chord is most of what says whether it is C or Am: they
     are the same three notes and a different one underneath. */
  var BASS_LOW = 40;
  var BASS_HIGH = 55;

  var freqs = null;
  var binHz = 0;

  function plan() {
    binHz = ctx.sampleRate / wide.fftSize;
    freqs = new Float32Array(HIGH_NOTE - LOW_NOTE + 1);
    for (var n = LOW_NOTE; n <= HIGH_NOTE; n++) {
      freqs[n - LOW_NOTE] = 440 * Math.pow(2, (n - 69) / 12);
    }
  }

  /* How much is sounding at this frequency, allowing for a string being a few
     cents off and for the bin grid never landing exactly on a note. Taken as
     the loudest bin within a quarter tone, because that is the width inside
     which it is still the same note. */
  function at(f) {
    var b = f / binHz;
    if (b < 1 || b >= spec.length - 1) return 0;
    var w = b * 0.0293;
    var lo = Math.max(1, Math.round(b - w));
    var hi = Math.min(spec.length - 1, Math.round(b + w));
    var best = -1000;
    for (var i = lo; i <= hi; i++) if (spec[i] > best) best = spec[i];
    return best <= -110 ? 0 : Math.pow(10, best / 20);
  }

  function salience(n, weights) {
    var f = freqs[n - LOW_NOTE];
    var s = 0;
    for (var h = 0; h < weights.length; h++) s += weights[h] * at(f * (h + 1));
    return s;
  }

  /* --- the chords worth naming ----------------------------------------------
     Seven shapes, which is what a chord sheet is written in. Not every chord
     in music: a 9th and a 13th differ from the 7th under them by one note that
     a microphone in a room is not going to be sure about, and offering them
     would be offering precision that is not there.

     THE WEIGHTS ARE NOT ALL ONE. The third is what makes a chord major or
     minor and it is the whole of the difference being measured, so it counts
     for as much as the root; the fifth is shared by nearly everything and
     says least, so it counts for less. */
  var SHAPES = [
    { q: "",     notes: [0, 4, 7],     w: [1, 1, 0.7] },
    { q: "m",    notes: [0, 3, 7],     w: [1, 1, 0.7] },
    { q: "7",    notes: [0, 4, 7, 10], w: [1, 1, 0.6, 0.85] },
    { q: "m7",   notes: [0, 3, 7, 10], w: [1, 1, 0.6, 0.85] },
    { q: "maj7", notes: [0, 4, 7, 11], w: [1, 1, 0.6, 0.85] },
    { q: "sus4", notes: [0, 5, 7],     w: [1, 0.95, 0.8] },
    { q: "dim",  notes: [0, 3, 6],     w: [1, 1, 0.95] },
  ];

  /* Every shape at every root, as a unit vector, worked out once. The match
     below is then one dot product each, and there are eighty four of them. */
  var TEMPLATES = (function () {
    var all = [];
    for (var s = 0; s < SHAPES.length; s++) {
      for (var root = 0; root < 12; root++) {
        var v = new Float32Array(12);
        var len = 0;
        for (var i = 0; i < SHAPES[s].notes.length; i++) {
          v[(root + SHAPES[s].notes[i]) % 12] = SHAPES[s].w[i];
          len += SHAPES[s].w[i] * SHAPES[s].w[i];
        }
        len = Math.sqrt(len);
        for (i = 0; i < 12; i++) v[i] /= len;
        all.push({ root: root, quality: SHAPES[s].q, v: v });
      }
    }
    return all;
  })();

  /* A chord written on a page carries whatever its writer felt like writing:
     "Am7", "Cmaj7", "G/B", "F#sus", "D9". Reduced to one of the seven above,
     because that is the vocabulary a microphone can actually hold apart. What
     is dropped is dropped honestly: a 9 is heard as the 7 it is built on. */
  function shapeOf(colour) {
    var c = String(colour || "").replace(/\s+/g, "");
    /* the bass of a slash chord is a fact about the bass and not about the
       three notes, and it is scored separately below */
    c = c.split("/")[0];
    if (/^(maj7|Maj7|M7|Δ7?|maj9|M9)/.test(c)) return "maj7";
    if (/^(dim|°|o\b)/.test(c) || /^m7b5|^ø/.test(c)) return "dim";
    if (/^(aug|\+)/.test(c)) return "";
    /* Anywhere in the name and not only at the front, because "7sus4" is a
       sus chord: what makes it one is that there is no third in it, and a
       seventh over the top does not put one there. Both sus2 and sus4 come
       back as sus4, which is not true and is as close as three notes measured
       through a microphone are going to get. */
    if (/sus/.test(c)) return "sus4";
    if (/^(m|min|-)(?!aj)/.test(c)) return /7|9|11|13/.test(c) ? "m7" : "m";
    if (/(^|[^a-zA-Z])(7|9|11|13)/.test(c) || /^7|^9|^11|^13/.test(c)) return "7";
    return "";
  }

  var chroma = new Float32Array(12);
  var unit = new Float32Array(12);
  var bass = -1;

  /* --- THE BASS, WHICH IS THE WHOLE OF WHAT SEPARATES C FROM Am -------------
     Am is A C E and C is C E G. Two notes out of three are the same notes, so
     the twelve numbers above say almost nothing about which of the two is
     being played, and no amount of care with them ever will: they are very
     nearly the same chord. What is not the same is the note underneath, and
     that is the one thing a chord sheet and a pair of hands agree on.

     REPORTED FROM A SONG THAT IS BUILT OUT OF THAT PAIR. "שר ליבי" runs Am and
     C against each other line after line, and the follower spent sixteen
     seconds of a recording on the first chord change of the song, because a
     chord change has to be WON by a margin (see follow.js) and these two never
     win anything against each other. On a song of Am F Dm the same follower
     walked seventeen chords without a stumble.

     So the bass is worth more than it was. It was worth a flat 0.05 whenever
     it stood out at all, and the reason it was kept that small is real and has
     not gone away: the bottom of the spectrum is the part a phone hears worst,
     and a bass heard wrongly does not merely fail to help, it argues for the
     wrong chord.

     WHICH IS WHY WHAT CHANGED IS NOT ONLY THE SIZE. It is now worth what it is
     WORTH: nothing at all when the bottom is a muddle, and up to a quarter of
     the distance between two chords when one note down there is plainly louder
     than everything around it. At the old threshold it is worth what it always
     was, so the case that used to work is untouched, and only a bass somebody
     could point at gets more. */
  var BASS_HELP = 0.12;
  /* How much of the strongest note in the bass range the LOWEST one has to
     carry before it counts as being played rather than as the skirt of
     something above it. Three fifths: plainly there, and well under what a
     string actually struck comes back with. */
  var LOW_ENOUGH = 0.6;
  /* How much of BASS_HELP this reading's bass has earned. */
  var bassSure = 0;

  function chord() {
    var out = { rms: 0, chroma: chroma, bass: -1, best: [] };
    if (!ctx) return out;

    out.rms = loudness();
    if (out.rms < HUSH) {
      for (var z = 0; z < 12; z++) chroma[z] = 0;
      bass = -1;
      return out;
    }

    wide.getFloatFrequencyData(spec);

    var i, n, top = 0;
    for (i = 0; i < 12; i++) chroma[i] = 0;
    for (n = LOW_NOTE; n <= HIGH_NOTE; n++) chroma[n % 12] += salience(n, HARMONICS);
    for (i = 0; i < 12; i++) if (chroma[i] > top) top = chroma[i];
    if (top > 0) for (i = 0; i < 12; i++) chroma[i] /= top;

    /* --- THE LOWEST THING BEING PLAYED, AND LOWEST IS THE WHOLE OF IT --------
       IT USED TO TAKE THE LOUDEST and ask that it stand clear of the second
       loudest, and the answer was "no bass" in every room it was ever shown.
       The reason is in the arithmetic above: a note is measured as energy at
       its own pitch AND at the first few multiples of it (see salience), so
       when an A2 is sounding, the E3 a fifth over it is measured partly on the
       very same energy, and the two come back within a whisker of each other.
       The test asked the loudest note to beat its own harmonic by half again.
       Nothing ever does. So a number the follower leans on was, in practice,
       never there at all, and raising what it was worth changed nothing.

       A BASS IS NOT THE LOUDEST NOTE DOWN THERE, IT IS THE LOWEST ONE. That is
       what the word means and it is what a guitar does: on the open shapes a
       chord sheet is written in, the lowest string being played is the root
       itself, capo or no capo. So the search runs upwards and stops at the
       first note carrying a real part of the energy in this range, and how
       much of it that note carries is how sure we are. */
    var sal = [];
    var top = 0;
    for (n = BASS_LOW; n <= BASS_HIGH; n++) {
      var s = salience(n, [1, 0.5, 0.3]);
      sal.push(s);
      if (s > top) top = s;
    }
    bass = -1;
    bassSure = 0;
    if (top > 0) {
      for (n = BASS_LOW; n <= BASS_HIGH; n++) {
        var mine = sal[n - BASS_LOW];
        if (mine < top * LOW_ENOUGH) continue;
        bass = n % 12;
        /* All of it when the lowest note is also the strongest, which is what
           a struck bass string looks like, and less as it fades towards the
           floor this search stops at. */
        bassSure = Math.min(1, (mine / top - LOW_ENOUGH) / (1 - LOW_ENOUGH));
        break;
      }
    }
    out.bass = bass;

    out.best = weigh(chroma);
    return out;
  }

  /* --- TWELVE NUMBERS IN, A RANKING OUT --------------------------------------
     Split out from the reading above so that it can be handed a chord made up
     on paper and asked what it makes of it, which is the only part of this
     file that can be tested without a microphone in the room. See
     test/ear.test.mjs: the arithmetic that has to tell C major from A minor is
     exactly this, and it is worth being sure of it away from a guitar.

     COSINE SIMILARITY, which is the one measurement here that does not care
     how hard the strings were hit: it compares the SHAPE of the twelve numbers
     against the shape of a chord, and a quiet strum and a loud one of the same
     chord have the same shape. */
  function weigh(vec, low) {
    /* A bass handed in by name is a bass somebody is certain about: there is
       no spectrum here to have been unsure of. */
    if (arguments.length > 1) {
      bass = low == null ? -1 : low;
      bassSure = bass < 0 ? 0 : 1;
    }
    var i, len = 0;
    for (i = 0; i < 12; i++) len += vec[i] * vec[i];
    len = Math.sqrt(len) || 1;
    for (i = 0; i < 12; i++) unit[i] = vec[i] / len;

    var scored = [];
    for (i = 0; i < TEMPLATES.length; i++) scored.push({
      root: TEMPLATES[i].root,
      quality: TEMPLATES[i].quality,
      score: dot(TEMPLATES[i]),
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 6);
  }

  function dot(t) {
    var s = 0;
    for (var i = 0; i < 12; i++) s += unit[i] * t.v[i];
    if (bass >= 0 && bass === t.root) s += BASS_HELP * bassSure;
    return s;
  }

  /* What the last reading thought of one particular chord, asked by name. This
     is the question the app actually needs answered on a song page: not "what
     is being played" out of everything, but "of the chords THIS SONG uses,
     which does it look like", which is a far smaller and far easier question.

     Answered against the reading already taken, so asking about eight chords
     costs eight dot products and not eight readings. */
  function score(root, colour) {
    var want = shapeOf(colour);
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].root === root && TEMPLATES[i].quality === want) return dot(TEMPLATES[i]);
    }
    return 0;
  }

  window.CHORDS_EAR = {
    open: open,
    close: close,
    live: live,
    /* THE SAME STREAM, for whoever wants to keep it rather than measure it.
       A recording and a reading are two things done to one microphone, and
       asking for a second one would be a second permission prompt, a second
       red light in the tab, and two recordings of the same room that do not
       line up with each other. */
    stream: function () { return stream; },
    note: note,
    chord: chord,
    score: score,
    shapeOf: shapeOf,
    weigh: weigh,
    HUSH: HUSH,
  };
})();
