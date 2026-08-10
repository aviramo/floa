/* ==========================================================================
   Where in the song we are.

   Two things, and neither of them knows what a microphone is or what a page
   is. Numbers in, a decision out. That is what makes both of them testable
   without a room and a guitar, which matters more here than anywhere else in
   the app: what is being decided is where on the page a mark goes, and a mark
   in the wrong place is worse than no mark at all.

   ---------------------------------------------------------------------------
   WHY THIS IS A DIFFERENT PROBLEM FROM NAMING A CHORD, AND AN EASIER ONE.

   ear.js answers "which of eighty four chords is this", and it wavers, because
   chords that share notes score within a point or two of each other and which
   of them wins a given reading comes down to which string happened to be
   loudest at that moment. That is not a fault to be fixed. It is the honest
   shape of the question.

   This asks something else entirely. THE SONG IS ALREADY KNOWN: its chords, in
   order, are on the page. So the question is never "which chord is this", and
   it is not even "where in this song are we". It is one question about one
   chord: the next one written down has not been played yet, and has it been
   played now.
   ========================================================================== */
(function () {
  "use strict";

  /* ==========================================================================
     A STABILISER, which is the smaller of the two and is about the panel
     rather than about the song.

     What it replaces was "the same answer three readings running", which is a
     seventh of a second and is nothing: one bad reading in the middle of a
     strum reset the count and the panel flickered.

     TWO IDEAS, AND THE SECOND ONE IS THE IMPORTANT ONE.

     A VOTE OVER A WINDOW rather than a run of agreement, so that one reading
     out of ten disagreeing costs a tenth of a vote instead of starting the
     count again. And the vote is weighted by how well each reading matched,
     because a reading that was barely sure is barely evidence.

     AND A SITTING TENANT. What makes a pair of chords flicker is that they are
     evenly matched: whichever is ahead this second is behind the next, and an
     honest majority vote reports every one of those swings. So the chord
     already being shown keeps its place unless it is beaten by a MARGIN.
     Nothing else stops two evenly matched answers from oscillating, and no
     amount of extra averaging is a substitute: the average of a coin toss is a
     coin toss.
     ========================================================================== */

  /* How far back the vote reaches, in milliseconds. Long enough to cover the
     moment of a strum, where the old chord is still ringing under the new one,
     and short enough that a real chord change is reported inside a beat. */
  var VOTE = 520;
  /* And what a challenger has to beat the sitting answer by. A quarter more
     evidence, which a genuine chord change passes within two or three readings
     and an evenly matched pair never passes at all. */
  var MARGIN = 1.28;

  function steady(window_, margin) {
    var span = window_ || VOTE;
    var over = margin || MARGIN;
    var seen = [];
    var said = null;

    return {
      /* One reading in, the answer that should be on screen out. `name` is
         null when the reading was not sure enough to be worth anything, which
         still counts: silence is evidence that whatever was ringing has
         stopped. */
      hear: function (name, score, now) {
        seen.push({ name: name, score: name ? score : 0, at: now });
        while (seen.length && now - seen[0].at > span) seen.shift();

        var tally = Object.create(null);
        var top = null;
        for (var i = 0; i < seen.length; i++) {
          var one = seen[i];
          if (!one.name) continue;
          tally[one.name] = (tally[one.name] || 0) + one.score;
          if (!top || tally[one.name] > tally[top]) top = one.name;
        }

        if (!top) said = null;
        else if (said === top) { /* already there */ }
        else if (!(said in tally)) said = top;
        else if (tally[top] > tally[said] * over) said = top;
        return said;
      },
      says: function () { return said; },
      forget: function () { seen = []; said = null; },
    };
  }

  /* ==========================================================================
     AND THE FOLLOWER, WHICH WAITS FOR ONE CHORD AT A TIME.

     THE MARK STANDS ON A CHORD THAT HAS NOT BEEN PLAYED YET, and everything
     below is bookkeeping for that one sentence. The chord written next in the
     song is the chord being waited for; when it is heard, the mark moves on to
     the one after it and waits for that one; and a song is followed by being
     waited through, chord by chord, in the order somebody wrote it down.

     It is also the chord a reader wants under the mark. The one they are
     playing is already under their hand and they know what it is. What the
     page can tell them that they do not know is what comes next.

     ---------------------------------------------------------------------------
     WHAT WAS HERE BEFORE, AND WHY IT IS GONE.

     A Viterbi pass over the whole song. Every chord in it was a place we could
     be, every reading scored all of them, each place was reachable from the
     places behind it at a cost and from anywhere at a much larger one, and the
     cheapest story that explained every reading so far was where we were. It
     is the right answer to "given everything heard, where in this song are
     we", and that turned out not to be the question a page has to answer.

     BECAUSE IT ASKED THE ROOM ABOUT THE WHOLE SONG, EVERYTHING IN THE ROOM GOT
     A VOTE. A voice singing over the guitar, a second instrument, the chord
     before still ringing, a chord four lines further down that happens to
     share two notes with a chair being moved: each of them pushed some place
     in the song up a little, and the mark went wherever the pushing added up.
     Nothing on the screen could ever say why, because the reason was a sum
     over two hundred places. A mark that moves for reasons nobody in the room
     can see is worse than a mark that does not move.

     WAITING ASKS ONE THING INSTEAD: of everything in this sound, is the chord
     written next in it. A voice is not that chord. A chair is not. The chord
     still ringing is the one BEFORE, and is scored as exactly that. Almost
     everything that used to be able to move the mark now has nowhere to move
     it to, and what is left is the one comparison that was always doing the
     work.

     AND WHAT IS LOST IS WORTH SAYING. The old one could be dropped into the
     middle of a song it had never been told about and find itself inside two
     seconds, because it was searching all the time. This one is told where it
     starts, at the top, and being in the wrong place is something it notices
     afterwards rather than never falls into (see LOST below). That is the
     trade, and it is the right way round: being found quickly is worth little
     if being wrong is quiet.
     ========================================================================== */

  /* How much of the awaited chord has to be in the sound before it counts as
     having arrived at all. A chord being played scores three quarters and up
     against the chord it is; a room, a chair, a voice and the noise a
     microphone makes when it is switched on score flat and low against
     everything. */
  var HEARD = 0.66;

  /* AND IT HAS TO BEAT THE CHORD BEFORE IT, which is the one still ringing. A
     guitar does not stop when the hand moves: for a moment after a change both
     chords are inside the window the reading is taken over (see ear.js), and
     at the start of that moment the older one is the louder of the two. So
     arriving is not "the next chord is in the sound", it is "the next chord is
     more of this sound than the last one is", and until that happens nothing
     has been played that was not already playing.

     AND THE SIZE OF IT IS NOT A ROUNDING. A chord and the chord after it share
     notes far more often than not, Am into C, C into Am, G into Em, so while
     the first is ringing a good quarter of the readings hand the second the
     better score anyway, purely on which string happened to be loudest. A
     margin that only had to be beaten by a hair would be beaten by that within
     a bar, and the mark would run ahead of the hand chord after chord. Eight
     hundredths is what a real chord change clears in a reading or two and what
     the wobble between two chords that share two notes never clears at all.
     The model that stood here before this one asked for the same thing in
     different units, and it was the one number in it that was doing the work. */
  var LEAD = 0.08;

  /* Readings of that, running. Four of them is an eighth of a second, which no
     player will ever feel, and it is what stops the one loud confused reading
     in the middle of a strum from moving the mark on its own. */
  var HOLD = 4;

  /* --- A CHORD THAT NOBODY HEARD --------------------------------------------
     Damped, played quietly, missed by the microphone, or simply skipped. The
     song carried on and the mark is waiting for something that is not coming.

     So the chord AFTER the awaited one is scored too, and when THAT is what is
     sounding, plainly and for long enough not to be a stray reading, the
     awaited one is taken as having gone by. The mark then steps twice in quick
     succession, because the reading that moved it the first time still applies
     the second time, and on the page that looks like catching up, which is
     what it is.

     Longer than HOLD by a good margin, and deliberately: stepping over a chord
     nobody played is a guess, and stepping over one somebody is about to play
     is the mark running ahead of the hand. */
  var GONE_BY = 10;

  /* --- AND A SONG WITH THE SAME CHORD WRITTEN TWICE --------------------------
     Am, and then Am again. There is nothing in the sound that says the player
     reached the second one: it is the same six strings, and no microphone will
     ever hear the difference between a chord held and a chord played again.

     What CAN be heard is a fresh strum, so that is what is waited for. And it
     only counts once the first of the two has been held for about as long as
     chords in this song have been lasting, because a song strummed four times
     to the bar is four strums to the bar, and without the wait the mark would
     walk four chords through every one of them.

     It is a guess. It is the only thing there is to go on, and it is used
     nowhere else. */
  var STRUM = 1.7;      /* louder than the quietest moment just behind it */
  var DWELL = 0.55;     /* of however long the chord before it lasted */
  var DWELL_MIN = 500;  /* and never less than half a second */
  /* How far back "just behind it" reaches when looking for the quiet a strum
     rises out of. Long enough to hold the gap between two strums, short enough
     that it is not measuring the last chord. */
  var ROOM = 320;

  /* --- AND WAITING IN THE WRONG PLACE ENTIRELY -------------------------------
     Somebody opened the song in the middle, or played the verse again, or put
     the phone down for a minute and picked the song up somewhere else. The
     mark is waiting for a chord that is not coming, and the song is going on
     without it.

     Nothing here searches the song on every reading. That is the thing that
     was taken out and it is not coming back in through a side door. But a mark
     that has sat still while the room plainly played SEVERAL chords of this
     song that were neither the one awaited nor the one before it is a mark in
     the wrong place, and the last two chords actually heard, in the order they
     were heard, are usually enough to say where the right place is. A PAIR and
     not a single chord: one Am appears eight times in a song and says nothing,
     and "F and then C" appears twice at most.

     Counted in readings that disagree rather than in seconds, so that a pause
     between two verses costs nothing: silence is not a chord being heard
     somewhere else. */
  var LOST = 45;

  /* `starts` is which places in the song begin a part: the first chord under
     each heading. Optional, and a song without any is a song with one part.
     Used in one place only, to break a tie when the waiting has to be moved:
     somebody who went back went back to the top of something. */
  function make(names, starts) {
    var n = names ? names.length : 0;
    var opens = new Uint8Array(n);
    if (starts) for (var s = 0; s < starts.length; s++) {
      if (starts[s] >= 0 && starts[s] < n) opens[starts[s]] = 1;
    }

    /* The distinct chords, and which of them each place in the song is. The
       caller scores the DISTINCT ones, which is eight or so, rather than every
       place in the song, which is hundreds. */
    var kinds = [];
    var which = Object.create(null);
    var of = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      var name = String(names[i]);
      if (!(name in which)) { which[name] = kinds.length; kinds.push(name); }
      of[i] = which[name];
    }

    /* THE PLACE BEING WAITED FOR, which is the whole of the state and is what
       the mark is drawn on. */
    var at = 0;
    /* When it started being waited for, and how long the one before it took.
       Both are here for the repeat above and for nothing else. */
    var since = 0;
    var lastLong = 0;
    var now = 0;
    /* Readings running that say it has arrived, that the one after it is
       sounding instead, and that some other chord of this song is. */
    var held = 0;
    var slipped = 0;
    var astray = 0;
    /* What the room has been plainly playing, and for how many readings, so
       that a chord is written into the tape once rather than twenty times. */
    var sure = -1;
    var sureFor = 0;
    var tape = [];
    /* How loud it has been just lately, for hearing a strum. */
    var room = [];

    function reset() {
      at = 0; since = 0; lastLong = 0;
      held = 0; slipped = 0; astray = 0;
      sure = -1; sureFor = 0;
      tape = []; room = [];
    }

    /* Somebody said where they are, by touching a chord on the page. Which is
       worth more than any amount of listening, and here it is not an argument
       to be won either: the waiting simply moves. */
    function put(i) {
      if (!(i >= 0 && i < n)) return at;
      at = i; since = now; lastLong = 0;
      held = 0; slipped = 0; astray = 0;
      return at;
    }

    function quietest() {
      var q = -1;
      for (var i = 0; i < room.length; i++) if (q < 0 || room[i].rms < q) q = room[i].rms;
      return q < 0 ? 0 : q;
    }

    /* ONE READING. `scores` is one number per DISTINCT chord, in the order of
       `kinds`, and each is how much this reading looked like that chord. A
       place in the song that is not a chord at all, "N.C." or a word somebody
       typed, is handed in as a NEGATIVE score: there is nothing to wait for
       there, and the mark steps over it rather than standing on it forever.

       `scores` is null for a reading with nothing in it, which is most of the
       readings in a quiet room. The loudness is still taken, because a strum
       is heard as a rise out of the quiet before it and the quiet is half the
       measurement. */
    function step(scores, rms, when) {
      if (!n) return { here: -1, moved: false };
      now = when;
      if (!since) since = now;

      room.push({ at: now, rms: rms });
      while (room.length && now - room[0].at > ROOM) room.shift();

      var moved = scores ? read(scores) : false;
      return { here: at, moved: moved };
    }

    function read(scores) {
      /* A place that is not a chord is not something anybody can play, so it
         is not something to wait for. */
      if (scores[of[at]] < 0) return onward();

      var want = of[at];
      var back = at > 0 ? of[at - 1] : -1;
      var next = at + 1 < n ? of[at + 1] : -1;
      var sWant = scores[want];
      var sBack = back >= 0 && scores[back] >= 0 ? scores[back] : 0;
      var sNext = next >= 0 ? scores[next] : -1;

      /* --- WHAT THE ROOM IS PLAINLY PLAYING ---------------------------------
         Not used to decide anything about the waiting. Kept because a mark in
         the wrong place has to be noticed somehow, and this is the only thing
         that can notice it. */
      var top = -1, best = 0, k;
      for (k = 0; k < kinds.length; k++) if (scores[k] > best) { best = scores[k]; top = k; }
      if (top >= 0 && best >= HEARD) {
        if (top === sure) { if (++sureFor === HOLD && tape[tape.length - 1] !== top) tape.push(top); }
        else { sure = top; sureFor = 1; }
        if (tape.length > 4) tape.shift();
      } else { sure = -1; sureFor = 0; }

      /* --- HAS IT ARRIVED ---------------------------------------------------- */
      if (back < 0) {
        /* THE FIRST CHORD OF THE SONG has nothing ringing behind it to be
           louder than, so what is asked of it instead is that it be the chord
           the room is most plainly playing. Without that, any sound at all
           that scored two thirds against it would open the song. */
        if (sWant >= HEARD && top === want) { if (++held >= HOLD) return onward(); }
        else held = 0;
      } else if (want !== back) {
        if (sWant >= HEARD && sWant >= sBack + LEAD) { if (++held >= HOLD) return onward(); }
        else held = 0;
      } else {
        /* the same chord written twice, where only a fresh strum can say it */
        held = 0;
        if (sWant >= HEARD && loud() > quietest() * STRUM &&
            now - since >= Math.max(DWELL_MIN, lastLong * DWELL)) return onward();
      }

      /* --- OR GONE BY -------------------------------------------------------- */
      if (sNext >= HEARD && sNext >= sWant + LEAD && sNext >= sBack + LEAD) {
        if (++slipped >= GONE_BY) return onward();
      } else slipped = 0;

      /* --- OR THE WAITING IS IN THE WRONG PLACE ------------------------------ */
      if (best >= HEARD) {
        if (top !== want && top !== back) { if (++astray >= LOST) return relocate(); }
        else astray = 0;
      }

      return false;
    }

    /* The last loudness taken, which is what a strum is measured with. Read
       back out of the room rather than passed around, so that `read` has one
       argument and the two measurements cannot get out of step. */
    function loud() {
      return room.length ? room[room.length - 1].rms : 0;
    }

    function onward() {
      held = 0; slipped = 0; astray = 0;
      /* The last chord of the song, played. There is nothing after it to wait
         for and the mark stays on it, which is where somebody finishing a song
         is looking anyway. */
      if (at + 1 >= n) { since = now; return false; }
      lastLong = now - since;
      at++;
      since = now;
      return true;
    }

    /* Where the last two chords heard actually stand in the song, and the
       waiting moves to just after them. Nothing is searched for unless the
       waiting has already been shown to be wrong, and a pair is looked for
       rather than a chord, because one chord names eight places and two name
       one. */
    function relocate() {
      astray = 0;
      if (tape.length < 2) return false;
      var a = tape[tape.length - 2], b = tape[tape.length - 1];
      var found = -1, p;
      for (p = 1; p < n; p++) {
        if (of[p - 1] !== a || of[p] !== b) continue;
        if (found < 0 || rank(p) < rank(found)) found = p;
      }
      if (found < 0) return false;
      at = Math.min(n - 1, found + 1);
      since = now; lastLong = 0;
      held = 0; slipped = 0;
      return true;
    }

    /* Which of two places that both fit is the one meant. THE TOP OF A PART
       first, because somebody who went somewhere else went to the top of
       something, and then whichever is nearest to where the waiting already
       was, because a song is more often carried on with than jumped about in. */
    function rank(p) {
      return (opens[p - 1] ? 0 : 1) * 1000000 + Math.abs(p - at);
    }

    reset();
    return {
      kinds: kinds, length: n,
      step: step, put: put, reset: reset,
      where: function () { return at; },
    };
  }

  window.CHORDS_FOLLOW = { make: make, steady: steady };
})();
