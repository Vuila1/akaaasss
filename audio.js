/**
 * Christmas Audio Engine — Ryuichi Sakamoto "Merry Christmas Mr. Lawrence (Playing the Piano 2022)"
 * - Plays the official MP3 directly via HTMLAudioElement (loop = true, volume = 0.88).
 * - Automatically searches both `./` and `../` for the MP3 file so it loads regardless of whether
 *   the file sits in `christmas-ascii-web/` or the parent workspace folder.
 * - Preloads the MP3 silently on script load and starts playback only when `initAndPlay()`
 *   is triggered by the user clicking the "Click here" splash screen.
 * - Provides real-time `getMusicEnergy()` and `getBeatPulse()` synced to `audioEl.currentTime`
 *   (~102 BPM 3+3+2 Sakamoto ostinato & dynamic song sections) for `tree3d.js`.
 */
(function () {
  'use strict';

  const TRACK_FILENAME = 'Merry Christmas Mr. Lawrence - From Ryuichi Sakamoto Playing the Piano 2022.mp3';
  const CANDIDATE_SRCS = [
    encodeURI(TRACK_FILENAME),
    encodeURI('../' + TRACK_FILENAME),
    TRACK_FILENAME,
    '../' + TRACK_FILENAME
  ];

  // ~102 BPM tempo of Ryuichi Sakamoto's "Playing the Piano 2022" rendition
  const TEMPO_BPM = 102;
  const BEAT_SEC = 60 / TEMPO_BPM; // ~0.588235s per quarter note
  const BAR_SEC = BEAT_SEC * 4;    // ~2.35294s per 4/4 measure

  let audioEl = null;
  let candidateIndex = 0;
  let mp3Ready = false;
  let mp3Playing = false;
  let mp3AllFailed = false;
  let wantsPlayback = false;
  let unlockBound = false;
  let visibilityBound = false;
  let loadAttemptedForSrc = false;
  let removeGestureListenersRef = null;

  // Smoothed energy & pulse state for visual synchronization
  let smoothedEnergy = 0.35;
  let smoothedPulse = 0.25;
  let lastSyncWallTime = 0;
  let lastSyncResult = null;

  function ensureAudioElement() {
    if (audioEl || typeof window === 'undefined' || typeof Audio === 'undefined') {
      return audioEl;
    }

    candidateIndex = 0;
    loadAttemptedForSrc = false;
    audioEl = new Audio(CANDIDATE_SRCS[candidateIndex]);
    audioEl.setAttribute('playsinline', '');
    audioEl.setAttribute('webkit-playsinline', '');
    audioEl.loop = true;
    audioEl.volume = 0.88;
    audioEl.preload = 'auto';

    audioEl.addEventListener('canplay', function () {
      mp3Ready = true;
      if (wantsPlayback && audioEl.paused) {
        tryPlayAudioElement(false);
      }
    });

    audioEl.addEventListener('playing', function () {
      mp3Ready = true;
      mp3Playing = true;
    });

    audioEl.addEventListener('pause', function () {
      mp3Playing = false;
    });

    audioEl.addEventListener('ended', function () {
      mp3Playing = false;
    });

    audioEl.addEventListener('error', function () {
      if (candidateIndex + 1 < CANDIDATE_SRCS.length) {
        candidateIndex++;
        loadAttemptedForSrc = false;
        audioEl.src = CANDIDATE_SRCS[candidateIndex];
        try {
          audioEl.load();
        } catch (e) {}
        if (wantsPlayback) {
          tryPlayAudioElement(false);
        }
      } else {
        mp3AllFailed = true;
      }
    });

    return audioEl;
  }

  function tryPlayAudioElement(fromGesture) {
    const el = ensureAudioElement();
    if (!el || mp3AllFailed) return;

    if (!el.paused && !el.ended) {
      mp3Playing = true;
      return;
    }

    // iOS Safari skips preload before first interaction; trigger a safe one-time load() inside gesture
    if (fromGesture && wantsPlayback && el.readyState === 0 && (!loadAttemptedForSrc || el.networkState === 0)) {
      loadAttemptedForSrc = true;
      try {
        el.load();
      } catch (e) {}
    }

    try {
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(function () {
          mp3Playing = true;
          mp3Ready = true;
          if (typeof removeGestureListenersRef === 'function') {
            removeGestureListenersRef();
          }
        }).catch(function () {
          // Autoplay blocked until valid iOS/mobile user gesture (touchend/click)
          mp3Playing = false;
          if (wantsPlayback) {
            bindAutoUnlockListeners();
          }
        });
      } else {
        mp3Playing = !el.paused;
      }
    } catch (e) {
      mp3Playing = false;
    }
  }

  function bindAutoUnlockListeners() {
    if (unlockBound || typeof window === 'undefined') return;
    unlockBound = true;

    // iOS Safari requires HTMLAudioElement.play() directly inside touchend/click (not pointerdown alone)
    const gestureEvents = ['click', 'touchend', 'keydown', 'pointerdown'];

    const onUserGesture = function () {
      if (!wantsPlayback) return;

      const el = ensureAudioElement();
      if (el && el.paused && !mp3AllFailed) {
        tryPlayAudioElement(true);
      } else if (el && !el.paused) {
        mp3Playing = true;
        removeGestureListeners();
      }
    };

    function removeGestureListeners() {
      if (!unlockBound) return;
      unlockBound = false;
      for (let i = 0; i < gestureEvents.length; i++) {
        window.removeEventListener(gestureEvents[i], onUserGesture, true);
        if (typeof document !== 'undefined') {
          document.removeEventListener(gestureEvents[i], onUserGesture, true);
        }
      }
    }

    removeGestureListenersRef = removeGestureListeners;

    for (let i = 0; i < gestureEvents.length; i++) {
      window.addEventListener(gestureEvents[i], onUserGesture, { capture: true, passive: true });
      if (typeof document !== 'undefined') {
        document.addEventListener(gestureEvents[i], onUserGesture, { capture: true, passive: true });
      }
    }
  }

  function bindVisibilityListeners() {
    if (visibilityBound || typeof window === 'undefined') return;
    visibilityBound = true;

    const onVisibilityOrPageShow = function () {
      mp3Playing = Boolean(audioEl && !audioEl.paused && !audioEl.ended);
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      if (wantsPlayback && audioEl && audioEl.paused && !mp3AllFailed) {
        bindAutoUnlockListeners();
        tryPlayAudioElement(false);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityOrPageShow);
    }
    window.addEventListener('pageshow', onVisibilityOrPageShow);
  }

  /**
   * Compute musical section envelope & rhythmic pulse from Ryuichi Sakamoto's
   * "Merry Christmas Mr. Lawrence (Playing the Piano 2022)" at track time `t` (seconds).
   */
  function evaluateSakamotoDynamics(t, activePlaying) {
    const duration = (audioEl && audioEl.duration && isFinite(audioEl.duration) && audioEl.duration > 10)
      ? audioEl.duration
      : 280.0;
    const trackTime = ((t % duration) + duration) % duration;

    // Song structural dynamics (Playing the Piano 2022 arrangement ~4m40s):
    // 0-28s: Delicate high-register bell intro
    // 28-68s: Main theme ostinato enters (~102 BPM)
    // 68-106s: Contemplative harmonic bridge
    // 106-168s: Full resonant theme & bass octaves build
    // 168-224s: Emotional climax / forte Sakamoto theme
    // 224-end: Quiet bell coda & long pedal decay
    let sectionBase = 0.45;
    if (trackTime < 28) {
      sectionBase = 0.28 + 0.16 * (trackTime / 28);
    } else if (trackTime < 68) {
      sectionBase = 0.52 + 0.16 * Math.sin(((trackTime - 28) / 40) * Math.PI);
    } else if (trackTime < 106) {
      sectionBase = 0.44 + 0.14 * Math.sin(((trackTime - 68) / 38) * Math.PI);
    } else if (trackTime < 168) {
      const p = (trackTime - 106) / 62;
      sectionBase = 0.58 + 0.26 * p;
    } else if (trackTime < 224) {
      const p = (trackTime - 168) / 56;
      sectionBase = 0.82 + 0.14 * Math.sin(p * Math.PI);
    } else {
      const p = Math.min(1, (trackTime - 224) / Math.max(12, duration - 224));
      sectionBase = 0.52 * (1 - 0.55 * p);
    }

    // Measure & beat positions at ~102 BPM
    const barPos = (trackTime % BAR_SEC) / BAR_SEC; // 0..1 across 4 beats
    const beatInBar = barPos * 4.0;                 // 0..4 quarter beats
    const beatPhase = beatInBar % 1.0;              // 0..1 within current quarter beat
    const eighthPhase = (beatInBar * 2.0) % 1.0;    // 0..1 within eighth-note ostinato

    // Quarter-note piano attack envelope (sharp gentle attack, warm exponential piano decay)
    const quarterPulse = Math.pow(Math.max(0, 1.0 - beatPhase), 2.2);
    // Eighth-note Sakamoto ostinato shimmer
    const eighthPulse = Math.pow(Math.max(0, 1.0 - eighthPhase), 2.6) * 0.45;

    // Characteristic Sakamoto 3 + 3 + 2 tresillo accent (beats 0.0, 1.5, 3.0 in 4-beat bar)
    const d0 = Math.min(Math.abs(beatInBar - 0.0), Math.abs(beatInBar - 4.0));
    const d1 = Math.abs(beatInBar - 1.5);
    const d2 = Math.abs(beatInBar - 3.0);
    const tresilloDist = Math.min(d0, d1, d2);
    const tresilloAccent = Math.exp(-tresilloDist * 4.2);

    // 2-bar melodic phrase swell ("G#4 - A#4 - B4 - F#4 | E4 - F#4 - G#4 - D#4")
    const phraseWave = 0.5 + 0.5 * Math.sin((trackTime / (BAR_SEC * 2)) * Math.PI * 2 - 0.6);

    const rawPulse = Math.min(1.0, quarterPulse * 0.55 + tresilloAccent * 0.45 + eighthPulse * 0.25);
    const rawEnergy = Math.min(
      1.0,
      Math.max(0.12, sectionBase * 0.68 + phraseWave * 0.14 + rawPulse * 0.26)
    );

    const activityScale = activePlaying ? 1.0 : 0.55;
    return {
      energy: rawEnergy * activityScale + (1 - activityScale) * 0.28,
      pulse: rawPulse * activityScale,
      phrase: phraseWave,
      trackTime: trackTime,
      duration: duration
    };
  }

  function updateSyncMetrics() {
    const nowWall = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (lastSyncResult && nowWall - lastSyncWallTime >= 0 && nowWall - lastSyncWallTime < 0.004) {
      return lastSyncResult;
    }
    const dt = lastSyncWallTime > 0 ? Math.min(0.1, Math.max(0.001, nowWall - lastSyncWallTime)) : 0.016;
    lastSyncWallTime = nowWall;

    const isActivelyPlaying = Boolean(audioEl && !audioEl.paused && !audioEl.ended);
    const currentTrackTime = isActivelyPlaying ? audioEl.currentTime : nowWall * 0.85;

    const target = evaluateSakamotoDynamics(currentTrackTime, isActivelyPlaying);
    const energyAlpha = 1 - Math.exp(-dt * 10.0);
    const pulseAlpha = 1 - Math.exp(-dt * 18.0);

    smoothedEnergy += (target.energy - smoothedEnergy) * energyAlpha;
    smoothedPulse += (target.pulse - smoothedPulse) * pulseAlpha;

    lastSyncResult = {
      energy: Math.max(0, Math.min(1, smoothedEnergy)),
      beatPulse: Math.max(0, Math.min(1, smoothedPulse)),
      phraseIntensity: target.phrase,
      tempoBpm: TEMPO_BPM,
      currentTime: currentTrackTime,
      progress: target.duration > 0 ? (target.trackTime / target.duration) : 0,
      isPlaying: isActivelyPlaying
    };
    return lastSyncResult;
  }

  /**
   * Public API: Initialize and immediately play "Merry Christmas Mr. Lawrence".
   * Attaches fallback gesture listeners on first call so playback recovers cleanly if interrupted.
   */
  function initAndPlay() {
    wantsPlayback = true;
    bindVisibilityListeners();
    bindAutoUnlockListeners();
    ensureAudioElement();
    tryPlayAudioElement(true);
  }

  /**
   * Public API: Returns real-time normalized musical energy (0.0 .. 1.0)
   * synced to "Merry Christmas Mr. Lawrence" for tree lights, star glow, and spiral speed.
   */
  function getMusicEnergy() {
    return updateSyncMetrics().energy;
  }

  /**
   * Public API: Returns real-time rhythmic piano beat pulse (0.0 .. 1.0)
   * synced to the ~102 BPM quarter-note & 3+3+2 Sakamoto ostinato.
   */
  function getBeatPulse() {
    return updateSyncMetrics().beatPulse;
  }

  /**
   * Public API: Returns full synchronization state object for rich visual effects.
   */
  function getSyncState() {
    return updateSyncMetrics();
  }

  // Silently preload the MP3 on script load; playback waits until initAndPlay() is called
  ensureAudioElement();
  bindVisibilityListeners();

  window.ChristmasAudio = {
    initAndPlay: initAndPlay,
    getMusicEnergy: getMusicEnergy,
    getBeatPulse: getBeatPulse,
    getSyncState: getSyncState,
    resume: initAndPlay,
    isPlaying: function () {
      return Boolean(audioEl && !audioEl.paused && !audioEl.ended);
    },
    getAudioElement: function () {
      return audioEl;
    }
  };
})();
