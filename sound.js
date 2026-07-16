/**
 * sound.js — 효과음 (WebAudio 합성, 오디오 파일 0바이트)
 *
 * 개발 계획서 4.2: 효과음 파일을 CDN에서 받을 수 없고(오프라인망), 저장소에
 * 바이너리를 넣기도 부담스럽다. 발사음·명중음·버튼음은 오실레이터로 합성한다.
 * PRD 15.2의 스테이지 클리어 '음악'은 합성으로 감당하기 어려워 v2로 미뤘다.
 *
 * 브라우저는 사용자 제스처가 있어야 오디오를 시작하므로, 첫 클릭에서 resume한다.
 */

var Sound = (function () {
  'use strict';

  var ctx = null;
  var enabled = true;
  var master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function setEnabled(v) {
    enabled = !!v;
  }

  function isEnabled() {
    return enabled;
  }

  /** 오실레이터 하나로 짧은 음을 낸다. ADSR 없이 지수 감쇠로 단순화. */
  function tone(opts) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqTo) osc.frequency.exponentialRampToValueAtTime(opts.freqTo, t0 + opts.dur);

    var vol = opts.vol == null ? 0.6 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /** 화이트 노이즈 버스트 — 폭발·충돌에 쓴다. */
  function noise(dur, vol, filterFreq) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime;
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var data = buf.getChannelData(0);
    // 결정론적 의사난수 — Math.random을 피해 재현 가능하게 (일관성용)
    var seed = 1234567;
    for (var i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = ((seed / 0x3fffffff) - 1) * (1 - i / n);
    }
    var src = c.createBufferSource();
    src.buffer = buf;
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filterFreq || 1200;
    var g = c.createGain();
    g.gain.value = vol == null ? 0.5 : vol;
    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  // ─── 게임 이벤트별 소리 (PRD 15.1) ───────────────────────

  var SOUNDS = {
    button: function () {
      tone({ type: 'square', freq: 520, dur: 0.06, vol: 0.25 });
    },
    fire: function () {
      // 발사음: 낮은 곳에서 뿅 하고 올라간다
      tone({ type: 'sawtooth', freq: 180, freqTo: 90, dur: 0.18, vol: 0.5 });
      noise(0.12, 0.3, 900);
    },
    hit: function () {
      // 명중음: 밝은 상승 3화음
      tone({ type: 'square', freq: 660, dur: 0.1, vol: 0.4 });
      tone({ type: 'square', freq: 880, dur: 0.12, vol: 0.4, delay: 0.08 });
      tone({ type: 'square', freq: 1320, dur: 0.16, vol: 0.4, delay: 0.16 });
      noise(0.2, 0.35, 2200);
    },
    miss: function () {
      // 실패음: 가라앉는 두 음
      tone({ type: 'triangle', freq: 300, freqTo: 150, dur: 0.22, vol: 0.4 });
    },
    obstacle: function () {
      // 충돌음: 둔탁한 노이즈
      noise(0.18, 0.5, 500);
      tone({ type: 'sine', freq: 120, freqTo: 70, dur: 0.16, vol: 0.4 });
    },
    score: function () {
      tone({ type: 'sine', freq: 880, dur: 0.08, vol: 0.3 });
      tone({ type: 'sine', freq: 1180, dur: 0.1, vol: 0.3, delay: 0.06 });
    },
    clear: function () {
      // 맵 클리어: 상승 아르페지오
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        tone({ type: 'square', freq: notes[i], dur: 0.18, vol: 0.35, delay: i * 0.1 });
      }
    },
    rank: function () {
      // 랭킹 등록: 반짝임
      var notes = [784, 988, 1319, 1568, 2093];
      for (var i = 0; i < notes.length; i++) {
        tone({ type: 'triangle', freq: notes[i], dur: 0.14, vol: 0.3, delay: i * 0.07 });
      }
    }
  };

  function play(name) {
    var fn = SOUNDS[name];
    if (fn) fn();
  }

  return {
    unlock: unlock,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    play: play
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
