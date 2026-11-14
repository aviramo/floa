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
  /* --- AND NOTHING SKIPS AHEAD ----------------------------------------------
     There was a cost here for landing two or three chords along, meant for a
     chord that went by without being heard: damped, played quietly, missed.

     It is gone, and the reason is what it looked like. A follower that is
     ALLOWED to skip does skip, on the readings it is least sure about, and
     what a reader sees is a mark that hops over chords. That is worse than a
     mark that lags, by a long way: a lagging mark is a mark you can still read
     the song from, and a hopping one has to be checked against the page every
     time it moves, which is exactly the work it exists to save.

     AND NOTHING IS LOST BY TAKING IT OUT, which is the good part. A chord
     nobody heard is still walked THROUGH: the reading after it, the one that
     matches, is reachable from it at the ordinary cost of the next chord, so
     the mark passes over the missed one in a reading or two and carries on. It
     catches up by walking rather than by jumping, and walking is what it is
     supposed to look like. */

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
  var BACK_START = Math.log(0.012);
  /* AND ANYWHERE AT ALL, from anywhere at all. This is the difference between
     a follower that recovers and one that does not: without it, a follower
     that lost the song at the second verse spends the rest of the song
     insisting it is still there, because every path back is impossible rather
     than merely expensive. One in three million a reading, which is about a
     second of being consistently wrong before starting again somewhere else
     becomes the cheaper story. */
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

  /* --- AND A LARGER ONE FOR NOT HAVING MOVED AT ALL --------------------------
     THE SITTING TENANT, and its absence is why the mark ran ahead of the
     playing. HOME above gives the same bonus to where we are and to the two
     places after it, which is right for the question it was written for, "do
     not leap across the song", and does nothing whatever for the question it
     was silently also answering: "has the chord actually changed yet".

     Because it had no answer to that, the two chords were level, and the next
     chord in a song is nearly always one that SHARES NOTES with the one before
     it. So on a reading where the noise happened to favour it by a hair, the
     mark moved, while the player was still on the first chord and had not
     touched anything.

     What this says is that a chord change has to be WON rather than tied.
     Which is the same rule the panel's own stabiliser lives by, and for the
     same reason: two evenly matched answers with nothing between them will
     swap forever, and the average of a coin toss is a coin toss.

     Its size is what "wait for the next chord" costs. A real chord change
     out-scores the chord before it by about three of these, so it still gets
     through in a reading or two; a hair's difference between two chords that
     share two notes out of three is worth a fraction of one, and now moves
     nothing. */
  /* --- AND HOW BIG IT ACTUALLY IS -------------------------------------------
     IT IS THIS MINUS HOME AND NOT THIS. The place we are on gets SIT and the
     place after it gets HOME, so what a chord change has to overcome is the
     difference between them: 0.4 in logs, which is a bit over two hundredths
     of a point of score at the belief below. That is the number that matters
     and it was 0.7, and 0.7 was too much for the songs people actually bring
     here.

     WHAT TOO MUCH LOOKED LIKE, off a recording rather than off a guess. The
     follower walked "שר ליבי" from end to end in order without skipping a
     chord, and did it ONE CHORD LATE: six and a half seconds on the chord
     before, then two chords inside a tenth of a second when it caught up. A
     chord held for a tenth of a second is a chord nobody sees, so what was
     reported was that it had been skipped. It had been passed through at a
     run. On a song whose chords all share two notes out of three, Am against C
     against Em, most changes were arriving that way.

     AND WHAT MAKES IT SAFE TO ASK FOR LESS is that there is more to have: the
     bass now separates exactly those pairs (see BASS_HELP in ear.js), so a
     real chord change carries an advantage where before it carried almost
     nothing. What is being lowered is what noise has to beat, and noise still
     has to beat it FOUR READINGS RUNNING and crosses zero in between, which is
     what the wobble test holds this to.

     AND IT WAS TRIED AT 1.2, WHICH IS 0.022, AND THE WOBBLE TEST REFUSED IT.
     The mark ran ahead of the playing on noise alone, which is the failure
     this bonus exists to prevent and is worse than lagging: a mark that lags
     can still be read from, and one that runs ahead has to be checked against
     the page every time it moves. So the number stays, and the way to a
     follower that keeps up is more evidence per reading rather than a lower
     bar for it: that is what the bass is for. */
  var SIT = 1.5;

  /* How sharply a score is believed. The scores coming in are cosine
     similarities and the interesting ones live between about .6 and .95, so a
     tenth of a point apart has to mean something: at eighteen it means about
     six times as likely, which is strong evidence from one reading and not
     proof. */
  var BELIEF = 18;

  /* --- AND HOW SHORT A CHORD IS ALLOWED TO HAVE BEEN -------------------------
     THE HOLE THIS FILLS, and it is worth writing out in full because it was
     invisible from every direction until a recording was read back.

     Going one place forward costs NEXT and then ONE reading of that place's own
     score. Which is right for a chord that is being played, and is exactly
     wrong for a chord that is merely being passed THROUGH on the way to a
     better one further along: a thirtieth of a second is not a length of time
     any chord in any song has ever lasted, so a place nobody played could be
     bought for a thirtieth of a second of its own bad score.

     WHAT THAT LOOKED LIKE. In a song running Am C Em, the ear had Em ahead of
     Am by seven hundredths for a third of a second. Am was being played and the
     C after it never led at any reading. Seven hundredths a reading is 1.26
     against the one-off 1.8 that passing over the C cost, so nine readings of a
     slightly better Em bought BOTH the C and the Em, and the arithmetic went
     two places forward on the evidence of the second one alone. Reported as
     "it skipped the C", and it had not: it had paid for it, at a price no chord
     is worth.

     SO A PLACE IS ENTERED AND THEN HELD. Every place is three states rather
     than one: arrived, still there, settled, and only the settled one may go on
     to the next place. Nothing may leave a place it entered less than three
     readings ago, which is a tenth of a second, and passing through one now
     costs THREE readings of its score rather than one. On the reading above,
     what had to be paid went from 1.8 to 5.4 and the third of a second stopped
     being enough.

     THREE, AND BOTH ENDS OF THAT WERE MEASURED OFF RECORDINGS RATHER THAN
     ARGUED FOR. It was six first, on the reasoning that six is 200 milliseconds
     and therefore sits between the ear's own window (170, below which a wait
     buys nothing because a chord change cannot be seen faster than that) and
     the shortest chord anybody plays (about 250). The reasoning was sound and
     the number was wrong, and a second recording said so within the hour.

     WHAT IT IS WORTH, at three: fed the first recording's numbers over and
     over, the arithmetic used to give way after thirteen readings of them and
     now gives way after twenty three. A line of the test holds it to that and
     fails without the wait.

     AND WHAT THE CEILING IS, which is the part no amount of thinking found.
     WHERE A VERSE ENDS ON THE CHORD IT BEGINS ON, and a great many do, a repeat
     puts those two identical chords side by side (see songSpans in app.js).
     Nothing in the sound can ever separate them, so the mark sits on the first
     until the chord AFTER them arrives and pulls it across both. Crossing the
     second one is therefore paid for entirely in the bonus for standing still
     (SIT against HOME, seven tenths a reading) with no difference in score to
     earn it back, so the wait is charged at full price there and nowhere else.
     At four readings and above the second recording never crossed that seam at
     all: the mark stopped at the end of the first verse and stayed there for
     the remaining twenty four seconds. At three it crosses exactly as it did
     before there was any wait. The whole of that recording's seam is in the
     test, because nothing shorter reproduced it.

     WHAT IT DOES NOT DO IS SAVE THE FIRST RECORDING, and it is worth being
     straight about that. Half a second past the drift the ear reported Am at
     0.47 against Em at 0.65, and eighteen hundredths held for over a second is
     not a wobble, it is the ear saying something definite and wrong. Nothing
     here should survive that, and nothing here can: what is left is a question
     for ear.js.

     AND THE PHASES BEFORE THE LAST ARE FREE, deliberately. Time passing is not
     a choice and must not be charged for: a chord genuinely being played costs
     what it always cost, so nothing above is retuned and nothing that worked
     moves. What is being made expensive is the place nobody stayed at. */
  var DWELL = 3;

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
  /* HALF A SECOND, WRITTEN AS READINGS, and the two are only the same number
     for as long as a reading is what it is. A reading is a thirtieth of a
     second on a song page (see EAR_GAP_CHORD in app.js), so eighteen of them is
     a little over half a second, and this was twelve when a reading was a
     twentieth. Speeding the ear up must not quietly make the follower hastier:
     what the ear buys is that the same certainty arrives sooner, not that less
     of it is asked for. */
  var PATIENCE = 18;

  /* And even one place forward is not taken on a single reading. Four of them,
     which is an eighth of a second and nobody sees, and it is the
     difference between a mark that moves when the playing moves and one that
     is nudged along by the loud confused moment in the middle of a strum. That
     moment used to cost nothing, and a mark nudged forward has to be walked
     back, which is a jump, which needs the patience above: so a transient too
     small to see would ratchet the mark forward and hold it there for half a
     second at a time. */
  var STEP = 4;

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

    /* THREE STATES TO A PLACE AND NOT ONE (see DWELL): arrived, still there,
       settled. Held flat, place by place, so that the state for phase `d` of
       place `j` is at `j * DWELL + d`. */
    var m = n * DWELL;
    var prev = new Float64Array(m);
    var cur = new Float64Array(m);
    /* The best value standing at each place, whichever of its phases that is
       in, which is what everything outside the place itself asks of it. */
    var top = new Float64Array(n);
    /* The best place AHEAD of each one, so that "come back to here from
       anywhere later in the song" is one lookup rather than a search. Filled
       from the far end backwards, once a reading. */
    var ahead = new Float64Array(n);
    var here = 0;
    var want = -1;
    var waited = 0;
    /* how many readings running have agreed that we are past `here` */
    var pushed = 0;
    /* whether the mark is already on its way to `want`, which is what makes
       the second step of a walk cost less than the first */
    var walking = false;
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
      for (var i = 0; i < m; i++) prev[i] = 0;
      here = 0; want = -1; waited = 0; pushed = 0; walking = false; locked = false;
    }

    /* Somebody said where they are, by touching a chord on the page. Which is
       worth more than any amount of listening, so everything else is put a
       long way behind it rather than merely nudged.

       INTO THE SETTLED PHASE, so that a finger says where we are and not also
       "and now wait a tenth of a second before the song may move on". It is an
       answer about this moment, and the next chord is allowed to follow it as
       closely as it likes. */
    function put(at) {
      if (!(at >= 0 && at < n)) return here;
      for (var i = 0; i < m; i++) prev[i] = -40;
      prev[at * DWELL + DWELL - 1] = 0;
      here = at; want = -1; waited = 0; pushed = 0; walking = false; locked = true;
      return here;
    }

    /* One reading. `scores` is one number per DISTINCT chord, in the order of
       `kinds`, and each is how much this reading looked like that chord. */
    function step(scores) {
      if (!n) return { at: -1, here: -1, alike: 0, moved: false };

      var j, d, best = -Infinity, at = 0;

      /* WHAT EACH PLACE IS WORTH, whichever of its phases that turns out to be
         in. Everything outside a place asks this and nothing outside it cares
         how long we have been standing there. */
      var was = -Infinity;
      for (j = 0; j < n; j++) {
        var high = -Infinity;
        for (d = 0; d < DWELL; d++) if (prev[j * DWELL + d] > high) high = prev[j * DWELL + d];
        top[j] = high;
        if (high > was) was = high;
      }
      var anywhere = was + LOST;

      /* Everything later in the song than each place, so that going back to it
         costs one comparison. Backwards from the end, which is the only
         direction this can be worked out in. */
      ahead[n - 1] = -Infinity;
      for (j = n - 2; j >= 0; j--) ahead[j] = top[j + 1] > ahead[j + 1] ? top[j + 1] : ahead[j + 1];

      for (j = 0; j < n; j++) {
        /* What this place is worth on this reading, before anything about how
           we came to be standing in it. The same for every phase of it: how
           long we have been here is not a fact about the sound.

           And the reason to stay near where we already are, which is the only
           evidence there is when the sound cannot tell two places apart. The
           place we are ON gets more than the places beside it, because "have
           we moved along" and "have we leapt across the song" are different
           questions and only one of them is answered by nearness. */
        var gain = BELIEF * scores[of[j]];
        if (j === here) gain += SIT;
        else if (j > here && j <= here + NEAR) gain += HOME;

        /* --- ARRIVING, which is the first phase and the only one anything
           arrives in. From the SETTLED phase of the place behind, so that
           nothing may be walked through in less than the wait; from anywhere
           later in the song, which is somebody playing the verse again and
           lands on the top of a part far more often than in the middle of one;
           or from anywhere at all. */
        var v = j >= 1 ? prev[(j - 1) * DWELL + DWELL - 1] + NEXT : -Infinity;
        var home = ahead[j] + (opens[j] ? BACK_START : BACK);
        if (home > v) v = home;
        if (anywhere > v) v = anywhere;
        cur[j * DWELL] = v + gain;

        /* --- STILL HERE. Time passing and not a choice, so it is free: a
           chord genuinely being played costs exactly what it always did, and
           what these readings charge for is the place's own score. */
        for (d = 1; d < DWELL - 1; d++) cur[j * DWELL + d] = prev[j * DWELL + d - 1] + gain;

        /* --- AND SETTLED, which is where a place is held and the only phase
           it may be left from. */
        var held = prev[j * DWELL + DWELL - 1] + STAY;
        var come = prev[j * DWELL + DWELL - 2];
        cur[j * DWELL + DWELL - 1] = (held > come ? held : come) + gain;

        /* THE NEAREST OF THE EQUALS. Where two places explain the readings
           exactly as well as each other, which in a song of four chords played
           forty times is most of them, the one to believe is the one closest
           to where we already were. Deciding it by which comes first in the
           song puts the mark on the first line and the page back at the top. */
        var pick = -Infinity;
        for (d = 0; d < DWELL; d++) if (cur[j * DWELL + d] > pick) pick = cur[j * DWELL + d];
        if (pick > best || (pick === best && Math.abs(j - here) < Math.abs(at - here))) {
          best = pick; at = j;
        }
      }

      /* Kept relative to the best, so the numbers stay where double precision
         is exact instead of walking off towards minus infinity over a song. It
         changes nothing: every comparison here is between two of them. */
      for (j = 0; j < m; j++) cur[j] -= best;
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
      } else if (at === here) { want = -1; waited = 0; pushed = 0; walking = false; }
      /* --- FORWARD IS ONE AT A TIME, ALWAYS -----------------------------------
         Not "one at a time unless it is further, in which case leap". The mark
         goes to the next chord and to no other, and where the arithmetic has
         got further ahead than that the mark WALKS after it, a place at a time,
         until it catches up. Each of those places is asked for as patiently as
         the first, so it is an eighth of a second per chord, and it looks like
         what it is: running to catch up with the playing.

         The alternative is a mark that arrives at the right place by hopping
         over the ones in between, and a reader cannot tell that from a mark
         that is simply wrong. This is the whole of what "one after the other"
         means, and it is worth more than the fraction of a second it costs. */
      /* --- HOW FAR AWAY IT IS DECIDES HOW LONG IT HAS TO HOLD ---------------
         AND NOT WHETHER THE MARK WALKS. The mark always walks, one place at a
         time, in whichever direction the arithmetic has gone; what changes
         with distance is how long the arithmetic has to keep saying it before
         the first step is taken.

         IT USED TO BE THE OTHER WAY ROUND. Anything within six places was
         walked after at once and anything past six had to hold for six hundred
         milliseconds, and the hole in the middle is what a real recording
         walked straight through: for three tenths of a second the ear said G,
         plainly, while a C was being played, and G lived four places away.
         Four is inside six, so the mark went after it, and three places later
         the playing pulled it on to the next chord of that name two lines
         further down. One confident third of a second cost a line and a half.

         Four readings for the next chord along, which is what a song does and
         must stay cheap; four for each place beyond that, up to the patience a
         jump has always needed. So a reading that disagrees by four places has
         to mean it for half a second, and a third of a second of nonsense
         moves nothing at all. */
      else if (at > here) {
        pushed = 0;
        var far = at - here;
        /* THE LONG WAIT IS TO DECIDE, AND IT IS PAID ONCE. How far away the
           arithmetic is says how long it has to keep saying it before the mark
           sets off; once the mark IS walking towards that same place, each
           further step costs the ordinary one, because the question "is this
           real" has already been answered and what is left is the walking. */
        var need = walking && at === want ? STEP
          : far <= 1 ? STEP : Math.min(PATIENCE, STEP * far);
        if (at === want) waited++;
        else { want = at; waited = 1; walking = false; }
        /* AND EACH PLACE IS EARNED ON ITS OWN. Without putting the count
           back, only the FIRST step is paid for: the wait is set by how far
           away the arithmetic is, so the moment one step is taken the distance
           is shorter, the price is lower, and the count already banked covers
           the rest. Three places went by in two readings that way, which on
           the page is the jump this was written to stop. */
        if (waited >= need) { here++; moved = true; waited = 0; walking = true; }
      }
      /* --- AND THE MARK NEVER GOES BACKWARDS ---------------------------------
         The arithmetic still can, and it should: a player who goes round the
         verse again is somewhere behind, the costs above are shaped for that,
         and knowing it is how the next reading gets scored properly. What
         changed is that the MARK does not follow it there.

         Asked for by the person playing, and the takes are why. Every
         backwards move on a real recording was wrong: a moment of confusion
         two chords back, a chord ringing into the next one, a slash chord
         matching something behind it. What a reader sees when the mark goes
         backwards is the song undoing itself, and there is no reading of that
         which helps: a mark that has fallen behind can still be read from, and
         a mark that has walked back has to be argued with.

         AND A REPEAT IS NOT LOST BY IT, which is the part worth knowing. The
         mark stops at the end of the part being played again and waits there,
         and when the playing comes round to that place a second time it is
         already standing on it. It looks like patience rather than like a
         mistake, and it is right again without anything having to be undone.

         A finger still goes anywhere (see put). Somebody who has gone back and
         wants the page with them says so, and that is worth more than any
         amount of listening. */
      else {
        pushed = 0; want = -1; waited = 0; walking = false;
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
