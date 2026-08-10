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
   order, are on the page. So the question is never "which chord is this", it
   is "are we still on the one we were on, or have we moved to the next one",
   and that is a choice between two or three rather than between eighty four.
   Everything else is thrown out before it reaches the vote.

   Which is why the wavering above does not carry through to here, and why the
   panel being unsure is not a reason to expect this to be.

   ---------------------------------------------------------------------------
   AND WHY IT IS NOT SIMPLY "TAKE THE BEST CHORD AND FIND IT IN THE SONG".

   Because most songs are four chords played four times. The second Am is
   indistinguishable from the first by any measurement of sound, forever, and
   no better microphone will ever change that. What separates them is not the
   sound, it is WHERE WE WERE A MOMENT AGO: the fifth Am is the one that comes
   after the fourth G. So the position is carried forward, every reading is
   evidence about how it moved rather than about where it is, and continuity
   does the work that the sound cannot do.

   That is what the arithmetic below is. Every chord in the song is a place we
   could be; each reading scores them all; and a place is only reachable from
   the places just behind it, at a cost, plus a way of jumping to anywhere at a
   much larger one. The cheapest story that explains all the readings so far is
   where we are. It is a Viterbi pass, run one reading at a time and never
   looking back, which is the whole of what "following" means here.

   THE JUMP TO ANYWHERE IS NOT A DETAIL. Without it, a follower that loses the
   song stays lost for as long as the song lasts, because every path back costs
   infinity. With it, being lost is expensive for a second and then over.
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
     AND THE FOLLOWER.

     Costs, in logs, because they are multiplied together over the whole song
     and a product of five hundred small numbers is nought in double precision.

     They are not measured from anything. They are the shape of playing a song:
     mostly you are still on the chord you were on, sometimes you have moved to
     the next one, occasionally a chord goes by without being sounded clearly
     enough to see, and once in a while somebody stops, starts again from the
     chorus, or turns two pages at once.
     ========================================================================== */
  var STAY = Math.log(0.86);
  var NEXT = Math.log(0.115);
  /* Two and three ahead: a chord that went by without being heard, damped,
     played quietly, or missed. Each much dearer than the one before, and there
     is no fourth, because skipping four chords is not something a player does.
     It is the follower being wrong. */
  var SKIP = [Math.log(0.012), Math.log(0.0015)];

  /* --- AND BACKWARDS, WHICH IS A THING SONGS DO ------------------------------
     Playing the verse again. Going round the chorus once more. Starting the
     line over because it came out wrong. None of those is being lost, and none
     of them was possible here except by way of the "jump to anywhere" below,
     which is fifty times dearer.

     WHICH IS THE BUG THIS EXISTS TO FIX, and it is worth saying exactly. In a
     song running Am D Am D F C E Am, a player who has reached the second D and
     wants the verse again plays Am. The Am they mean is two places BEHIND. The
     next Am in the written song is four places AHEAD, in the second verse. If
     going back can only be done by the anywhere jump and going forward can be
     done by skipping, then going forward is cheaper, and the follower answers
     a repeat by leaping over F, C and E into the next verse. Which is what it
     did.

     So a repeat has a cost of its own: dearer than the next chord by a long
     way, because most of the time the song simply carries on, and far cheaper
     than being lost, because this is a thing people do on purpose. */
  var BACK = Math.log(0.0004);

  /* AND GOING BACK TO THE TOP OF A PART IS CHEAPER STILL, because that is what
     a repeat actually is. Nobody plays one chord over again; they play the
     verse over again, and a verse starts where the song says {בית} starts.

     The app already knows where those are, it is written into every song, and
     handing them over turns "somebody went backwards" into "somebody went back
     to the beginning of a part", which is a far more specific guess and
     therefore a far better one. A song with no headings in it simply has one
     part, and everything below carries on exactly as it did. */
  var BACK_START = Math.log(0.006);
  /* AND ANYWHERE AT ALL, from anywhere at all. This is the difference between
     a follower that recovers and one that does not: without it, a follower
     that lost the song at the second verse spends the rest of the song
     insisting it is still there, because every path back is impossible rather
     than merely expensive. One in three million a reading, which is about a
     second and a half of being consistently wrong before starting again
     somewhere else becomes the cheaper story. */
  var LOST = Math.log(3e-7);

  /* --- AND A REASON TO STAY WHERE WE ARE ------------------------------------
     A small bonus, every reading, for the places within a bar of where we
     already think we are.

     WITHOUT IT A REPETITIVE SONG SNAPS BACK TO ITS FIRST LINE. "Am G F" forty
     times over is forty places that fit every reading exactly as well as each
     other, so the moment the follower stumbles, for a beat, on a chord change
     it missed, the fortieth Am and the FIRST Am are level, and a search for
     the best place picks whichever it looks at first. That is the top of the
     song. The mark jumps to the first line and the page scrolls up with it,
     over and over, which is the one failure that makes the whole thing
     useless: it is not lost, it is wrong and confident.

     The bonus is what says that a tie is not a tie. When nothing in the sound
     can separate two places, WHERE WE WERE A MOMENT AGO is the only evidence
     there is, and it should win. When something in the sound can separate them
     it is far too small to matter: a chord that matches where a chord that
     does not is worth about three of these, so real evidence still moves the
     mark within a couple of readings.

     HERE AND THE TWO PLACES AFTER IT, and deliberately not the two before. It
     is a reason not to leap across the song, not a reason to stand still, so
     carrying on is rewarded exactly as much as staying. And going BACK is a
     different question with its own answer below: a player repeating a part
     means the top of that part, and a bonus for the chord just behind them
     would keep pulling the mark one place back instead. */
  var HOME = 0.8;
  var NEAR = 2;

  /* How sharply a score is believed. The scores coming in are cosine
     similarities and the interesting ones live between about .6 and .95, so a
     tenth of a point apart has to mean something: at eighteen it means about
     six times as likely, which is strong evidence from one reading and not
     proof. */
  var BELIEF = 18;

  /* ONE FORWARD IS FREE AND NOTHING ELSE IS. A song moves to the next chord,
     so that step is taken the moment it is worked out and the mark keeps up
     with the playing. Everything else, including two forward, has to hold for
     PATIENCE readings first.

     Two forward was free here at first, and three, on the grounds that a chord
     is sometimes passed over. What that actually bought was the strum: one
     loud confused reading in the middle of a chord change names something four
     places along, and a follower allowed to go there at once goes there at
     once. Half a second of agreement is what separates a player who skipped a
     chord from a reading that was wrong, and there is no cheaper way to tell
     them apart than waiting. */
  var STRIDE = 1;
  var PATIENCE = 12;

  /* `starts` is which places in the song begin a part: the first chord under
     each heading. Optional, and a song without any is a song with one part. */
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

    var prev = new Float64Array(n);
    var cur = new Float64Array(n);
    /* The best place AHEAD of each one, so that "come back to here from
       anywhere later in the song" is one lookup rather than a search. Filled
       from the far end backwards, once a reading. */
    var ahead = new Float64Array(n);
    var here = 0;
    var want = -1;
    var waited = 0;
    /* WHETHER THERE IS ANYTHING TO BE LOYAL TO YET. Everything below is built
       to be slow to leave a position it believes in, and at the very first
       reading it believes in nothing: the song has just been opened and where
       we are is whatever the sound says. So the first few readings are taken
       as they come, and the patience starts once a position has held. */
    var locked = false;

    /* Nothing is known yet, so every place in the song is equally likely and
       the first few readings are what narrow it down. Not "the song starts at
       the beginning": somebody may well have pressed this in the middle of the
       second verse. */
    function reset() {
      for (var j = 0; j < n; j++) prev[j] = 0;
      here = 0; want = -1; waited = 0; locked = false;
    }

    /* Somebody said where they are, by touching a chord on the page. Which is
       worth more than any amount of listening, so everything else is put a
       long way behind it rather than merely nudged. */
    function put(at) {
      if (!(at >= 0 && at < n)) return here;
      for (var j = 0; j < n; j++) prev[j] = j === at ? 0 : -40;
      here = at; want = -1; waited = 0; locked = true;
      return here;
    }

    /* One reading. `scores` is one number per DISTINCT chord, in the order of
       `kinds`, and each is how much this reading looked like that chord. */
    function step(scores) {
      if (!n) return { at: -1, here: -1, alike: 0, moved: false };

      var j, best = -Infinity, at = 0;
      var was = -Infinity;
      for (j = 0; j < n; j++) if (prev[j] > was) was = prev[j];
      var anywhere = was + LOST;

      /* Everything later in the song than each place, so that going back to it
         costs one comparison. Backwards from the end, which is the only
         direction this can be worked out in. */
      ahead[n - 1] = -Infinity;
      for (j = n - 2; j >= 0; j--) ahead[j] = prev[j + 1] > ahead[j + 1] ? prev[j + 1] : ahead[j + 1];

      for (j = 0; j < n; j++) {
        var v = prev[j] + STAY;
        if (j >= 1 && prev[j - 1] + NEXT > v) v = prev[j - 1] + NEXT;
        for (var d = 2; d <= 3; d++) {
          if (j >= d && prev[j - d] + SKIP[d - 2] > v) v = prev[j - d] + SKIP[d - 2];
        }
        /* Somebody playing the verse again, which arrives here from further on
           in the song rather than from just behind, and which lands on the top
           of a part far more often than in the middle of one. */
        var home = ahead[j] + (opens[j] ? BACK_START : BACK);
        if (home > v) v = home;
        if (anywhere > v) v = anywhere;
        v += BELIEF * scores[of[j]];
        /* And the reason to stay near where we already are, which is the only
           evidence there is when the sound cannot tell two places apart. */
        if (j >= here && j <= here + NEAR) v += HOME;
        cur[j] = v;
        /* THE NEAREST OF THE EQUALS. Where two places explain the readings
           exactly as well as each other, which in a song of four chords played
           forty times is most of them, the one to believe is the one closest
           to where we already were. Deciding it by which comes first in the
           song puts the mark on the first line and the page back at the top. */
        if (v > best || (v === best && Math.abs(j - here) < Math.abs(at - here))) {
          best = v; at = j;
        }
      }

      /* Kept relative to the best, so the numbers stay where double precision
         is exact instead of walking off towards minus infinity over a song. It
         changes nothing: every comparison here is between two of them. */
      for (j = 0; j < n; j++) cur[j] -= best;
      var swap = prev; prev = cur; cur = swap;

      /* HOW MANY PLACES IN THE SONG CARRY THIS SAME CHORD, which is the only
         honest thing there is to say about how much this can be trusted. One
         means the sound alone settles it. Sixteen means the sound says nothing
         at all about which of them we are on and every bit of the answer is
         coming from where we were a moment ago, which is real evidence and is
         not proof.

         It replaced a number worked out from the paths themselves, and that
         one was measuring the model rather than the song: the costs below floor
         every rival at a fixed distance behind the leader, so it read as near
         certainty on every song ever written, including the ones that are four
         chords sixteen times. A number that is always the same is not a
         reading. */
      var alike = 0;
      for (j = 0; j < n; j++) if (of[j] === of[at]) alike++;

      var moved = false;
      if (!locked) {
        /* Still finding our feet. Take what the sound says and start counting
           patience only once it has said the same thing three times running. */
        here = at;
        if (at === want) { if (++waited >= 3) { locked = true; want = -1; waited = 0; } }
        else { want = at; waited = 1; }
        moved = true;
      } else if (at === here) { want = -1; waited = 0; }
      else if (at > here && at - here <= STRIDE) { here = at; moved = true; want = -1; waited = 0; }
      else {
        if (at === want) waited++;
        else { want = at; waited = 1; }
        if (waited >= PATIENCE) { here = at; moved = true; want = -1; waited = 0; }
      }

      return { at: at, here: here, alike: alike, moved: moved };
    }

    reset();
    return {
      kinds: kinds, length: n,
      step: step, put: put, reset: reset,
      where: function () { return here; },
    };
  }

  window.CHORDS_FOLLOW = { make: make, steady: steady };
})();
