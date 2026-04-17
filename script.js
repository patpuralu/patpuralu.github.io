/*MUSIC*/
const MUSIC_KEY = 'patpur_music_v2';
let musicStarted = false;

function getAudio()    { return document.getElementById('bgm'); }
function getMusicBtn() { return document.getElementById('musicBtn'); }

function updateMusicUI(playing) {
  const btn = getMusicBtn();
  if (!btn) return;
  const icon  = btn.querySelector('.music-icon');
  const label = btn.querySelector('.music-label');
  if (icon)  icon.textContent = playing ? '♫' : '♩';
  if (label) label.textContent = playing ? 'MUSIC ON' : 'MUSIC OFF';
  btn.classList.toggle('playing', playing);
}

function startMusic() {
  if (musicStarted) return;
  const audio = getAudio();
  if (!audio) return;
  if (sessionStorage.getItem(MUSIC_KEY) === 'off') return;

  audio.volume = 0;
  audio.play().then(() => {
    musicStarted = true;
    let v = 0;
    const fade = setInterval(() => {
      v = Math.min(v + 0.012, 0.28);
      audio.volume = v;
      if (v >= 0.28) clearInterval(fade);
    }, 80);
    updateMusicUI(true);
  }).catch(() => {});
}

window.toggleMusic = function () {
  const audio = getAudio();
  if (!audio) return;
  if (!musicStarted) {
    sessionStorage.removeItem(MUSIC_KEY);
    audio.volume = 0.28;
    audio.play().then(() => {
      musicStarted = true;
      updateMusicUI(true);
    });
    return;
  }
  if (audio.paused) {
    audio.play();
    sessionStorage.removeItem(MUSIC_KEY);
    updateMusicUI(true);
  } else {
    audio.pause();
    sessionStorage.setItem(MUSIC_KEY, 'off');
    updateMusicUI(false);
  }
};

function onInteraction() {
  startMusic();
  document.removeEventListener('click',      onInteraction);
  document.removeEventListener('keydown',    onInteraction);
  document.removeEventListener('touchstart', onInteraction);
}
document.addEventListener('click',      onInteraction);
document.addEventListener('keydown',    onInteraction);
document.addEventListener('touchstart', onInteraction);
window.addEventListener('load', () => { startMusic(); });

/* PAGE TRANSITIONS*/
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href]').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;
      e.preventDefault();
      document.body.classList.add('fade-out');
      setTimeout(() => { window.location.href = href; }, 400);
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r  = card.getBoundingClientRect();
      const rx =  ((e.clientY - r.top)  / r.height - 0.5) * 10;
      const ry = -((e.clientX - r.left) / r.width  - 0.5) * 10;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-10px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, pts;

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  pts = Array.from({ length: 110 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.3 + 0.3,
    vx: (Math.random() - 0.5) * 0.2,
    vy: (Math.random() - 0.5) * 0.2,
    a: Math.random() * 0.6 + 0.2,
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,180,255,${p.a * 0.5})`;
      ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 95) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(0,180,255,${(1 - d / 95) * 0.07})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
});
