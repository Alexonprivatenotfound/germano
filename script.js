document.addEventListener("DOMContentLoaded", () => {
  const cake = document.querySelector(".cake");
  const candleCountDisplay = document.getElementById("candleCount");

  const MAX_CANDLES = 54;
  const REMOVAL_DELAY = 2000; // ms before disappearance after being blown
  const FADE_DURATION = 800;  // ms fade/scale duration
  const BLOW_THRESHOLD = 0.1; // RMS threshold (lower => more sensitive)
  const BLOW_COOLDOWN = 600;   // ms between accepted blow events

  let candles = [];            // stores candle DOM elements
  let audioContext = null;
  let analyser = null;
  let microphone = null;

  let blowingUnlocked = false; // becomes true once the user reaches MAX_CANDLES
  let lastBlowTime = 0;

  /* ------------------ helpers ------------------ */
  function updateCandleCount() {
    // active = not having class 'out'
    const active = candles.filter((c) => !c.classList.contains("out")).length;
    if (candleCountDisplay) candleCountDisplay.textContent = active;
    return active;
  }

  function showNotice(msg, ms = 1800) {
    // small inline notice so user knows when blowing is unlocked
    let n = document.createElement("div");
    Object.assign(n.style, {
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: "20px",
      background: "rgba(255,255,255,0.95)",
      color: "#b01d55",
      padding: "10px 14px",
      borderRadius: "999px",
      fontWeight: "600",
      boxShadow: "0 6px 20px rgba(176,29,85,0.15)",
      zIndex: 9999,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    });
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => {
      n.style.transition = "opacity 300ms";
      n.style.opacity = "0";
      setTimeout(() => n.remove(), 350);
    }, ms);
  }

  /* ------------------ candle creation ------------------ */
  function addCandle(left, top) {
    // do not allow more than MAX_CANDLES (based on active candles)
    const active = updateCandleCount();
    if (active >= MAX_CANDLES) return;

    const candle = document.createElement("div");
    candle.className = "candle";
    candle.style.left = left + "px";
    candle.style.top = top + "px";
    // ensure visible and reset styles if reused
    candle.style.opacity = "1";
    candle.style.transform = "scale(1)";

    const flame = document.createElement("div");
    flame.className = "flame";
    candle.appendChild(flame);

    cake.appendChild(candle);
    candles.push(candle);

    // if we just reached MAX_CANDLES, unlock blowing
    const nowActive = updateCandleCount();
    if (!blowingUnlocked && nowActive >= MAX_CANDLES) {
      blowingUnlocked = true;
      showNotice("Blowing unlocked! Make a wish 💖");
      console.log("Blowing unlocked (54 candles placed).");
    }
  }

  cake.addEventListener("click", function (event) {
    const rect = cake.getBoundingClientRect();
    const left = event.clientX - rect.left;
    const top = event.clientY - rect.top;
    addCandle(left, top);
  });

  /* ------------------ microphone helpers ------------------ */
  function getMicRMS() {
    if (!analyser) return 0;
    const bufferLength = analyser.fftSize;
    const data = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      // centre around 0
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / bufferLength);
    return rms;
  }

  function isBlowing() {
    const rms = getMicRMS();
    return rms > BLOW_THRESHOLD;
  }

  /* ------------------ blow logic ------------------ */
  function performBlowEvent() {
    // only allow blowing if unlocked
    if (!blowingUnlocked) return;

    // throttle repeated triggers
    const now = Date.now();
    if (now - lastBlowTime < BLOW_COOLDOWN) return;

    if (!isBlowing()) return;
    lastBlowTime = now;

    // find candidates (not already marked 'out' or scheduled for removal)
    const candidates = candles.filter(
      (c) => !c.classList.contains("out") && !c.dataset.removing
    );

    if (candidates.length === 0) return;

    // Mark a random subset as blown — each candidate has a chance to be blown this breath.
    // The probability can be tuned (0.4 gives steady progress).
    const blowProbability = 0.45;

    let anyBlownNow = false;
    candidates.forEach((c) => {
      if (Math.random() < blowProbability) {
        anyBlownNow = true;
        c.classList.add("out");
        c.dataset.removing = "1"; // mark so we don't double-schedule

        // immediate UI update (count drops as soon as it's out)
        updateCandleCount();

        // schedule disappearance after REMOVAL_DELAY (2s)
        setTimeout(() => {
          // fade + shrink
          c.style.transition = `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`;
          c.style.opacity = "0";
          c.style.transform = "scale(0.72)";

          // finally remove and update list
          setTimeout(() => {
            if (c.parentNode) c.parentNode.removeChild(c);
            candles = candles.filter((el) => el !== c);
            const remaining = updateCandleCount();

            // if all gone, redirect
            if (remaining === 0) {
              setTimeout(() => {
                window.location.href = "celebration.html";
              }, 800);
            }
          }, FADE_DURATION);
        }, REMOVAL_DELAY);
      }
    });

    // if nothing was blown this breath, we just return; user can try again immediately (subject to cooldown)
    if (anyBlownNow) {
      console.log("Some candles blown this breath.");
    }
  }

  /* ------------------ init mic & loop ------------------ */
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // larger FFT so time-domain RMS is smoother
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        // keep checking frequently; performBlowEvent checks internal conditions
        setInterval(() => {
          // update unlocked state in case user added candles by other means
          if (!blowingUnlocked) {
            const active = updateCandleCount();
            if (active >= MAX_CANDLES) {
              blowingUnlocked = true;
              showNotice("Blowing unlocked! Make a wish 💖");
            }
          }
          performBlowEvent();
        }, 150);
      })
      .catch((err) => {
        console.error("Unable to access microphone:", err);
        showNotice("Microphone unavailable — blowing won't work.", 3000);
      });
  } else {
    console.warn("getUserMedia not supported in this browser.");
    showNotice("Your browser doesn't support the microphone API.", 3000);
  }
});
