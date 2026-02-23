let currentTab = 'url';
let fileSrc = null;
const stepMap = [0, 64, 32, 16, 8];
const stepLabels = ['None', 'Step 64', 'Step 32', 'Step 16', 'Step 8'];
let quantStep = 32;

window.addEventListener('DOMContentLoaded', () => {
  initSlider();
});

function initSlider() {
  const slider = document.getElementById('quantSlider');
  const ticks  = document.querySelectorAll('.slider-ticks span');
  const steps  = parseInt(slider.max); // 4

  // Position each tick exactly where thumb will be
  ticks.forEach((tick, i) => {
    const pct = (i / steps) * 100;
    tick.style.left = `calc(${pct}% + ${9 - pct * 0.18}px)`;
  });

  applySliderFill(slider);
  highlightTick(parseInt(slider.value));
}

function applySliderFill(slider) {
  const pct = (slider.value / slider.max) * 100;
  slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--surface2) ${pct}%)`;
}

function highlightTick(val) {
  document.querySelectorAll('.slider-ticks span').forEach((t, i) => {
    t.classList.toggle('active', i === val);
  });
}

const dz = document.getElementById('dropZone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadFile(f);
});

function updateSlider(val) {
  quantStep = stepMap[val];
  const label = document.getElementById('sliderVal');
  const slider = document.getElementById('quantSlider');

  // bounce label
  label.style.transition = 'transform .18s cubic-bezier(.34,1.56,.64,1), color .15s';
  label.style.transform = 'scale(1.2)';
  label.textContent = stepLabels[val];
  setTimeout(() => { label.style.transform = 'scale(1)'; }, 180);

  // fill track
  applySliderFill(slider);

  // highlight tick
  highlightTick(parseInt(val));
}

function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('urlTab').style.display = tab === 'url' ? '' : 'none';
  document.getElementById('fileTab').style.display = tab === 'file' ? '' : 'none';
}

function handleFile(input) {
  if (input.files[0]) loadFile(input.files[0]);
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    fileSrc = e.target.result;
    document.getElementById('fileThumb').src = fileSrc;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('fileInfo').classList.add('show');
    toast('File loaded');
  };
  reader.readAsDataURL(file);
}

function generate() {
  const src = currentTab === 'url'
    ? document.getElementById('imageUrl').value.trim()
    : fileSrc;

  if (!src) { toast('No image provided'); return; }

  const btn = document.getElementById('genBtn');
  btn.textContent = 'Converting...';
  btn.classList.add('loading');

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => processImage(img, src, btn);
  img.onerror = () => {
    btn.textContent = 'Convert';
    btn.classList.remove('loading');
    toast('Failed to load image');
  };
  img.src = src;
}

function processImage(img, originalSrc, btn) {
  let tmp = document.createElement('canvas');
  tmp.width = img.width; tmp.height = img.height;
  tmp.getContext('2d').drawImage(img, 0, 0);

  let w = img.width, h = img.height;
  while (w > 64 || h > 64) {
    w = Math.max(Math.floor(w / 2), 32);
    h = Math.max(Math.floor(h / 2), 32);
    const s = document.createElement('canvas');
    s.width = w; s.height = h;
    const sc = s.getContext('2d');
    sc.imageSmoothingEnabled = true;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(tmp, 0, 0, w, h);
    tmp = s;
  }

  const canvas = document.getElementById('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 32, 32);
  ctx.drawImage(tmp, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;

  const pixels = [];
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];
    if (quantStep > 0) {
      r = Math.min(255, Math.round(r / quantStep) * quantStep);
      g = Math.min(255, Math.round(g / quantStep) * quantStep);
      b = Math.min(255, Math.round(b / quantStep) * quantStep);
    }
    pixels.push([r, g, b]);
  }

  const pc = document.getElementById('previewCanvas');
  pc.width = 32; pc.height = 32;
  const pctx = pc.getContext('2d');
  const pd = pctx.createImageData(32, 32);
  pixels.forEach((p, i) => {
    pd.data[i*4] = p[0]; pd.data[i*4+1] = p[1];
    pd.data[i*4+2] = p[2]; pd.data[i*4+3] = 255;
  });
  pctx.putImageData(pd, 0, 0);

  const origImg = document.getElementById('originalImg');
  origImg.src = originalSrc;
  origImg.onload = () => origImg.classList.add('loaded');
  document.getElementById('outputBox').value = buildLua(pixels);
  document.getElementById('pixelCount').textContent = pixels.length;
  document.getElementById('resultCard').classList.add('show');

  btn.textContent = 'Convert';
  btn.classList.remove('loading');
  toast('Done');
}

function buildLua(pixels) {
  return [
    `local pixels = {`,
    pixels.map(p => `  {${p[0]},${p[1]},${p[2]}}`).join(',\n'),
    `}`,
    `local grid = game:GetService("Players").LocalPlayer`,
    `  .PlayerGui:WaitForChild("MainGui").PaintFrame.GridHolder.Grid`,
    `for i, rgb in ipairs(pixels) do`,
    `  local c = grid:FindFirstChild(tostring(i))`,
    `  if c then c.BackgroundColor3 = Color3.fromRGB(table.unpack(rgb)) end`,
    `end`
  ].join('\n');
}

function copyOut() {
  const v = document.getElementById('outputBox').value;
  if (!v) return;
  navigator.clipboard.writeText(v)
    .then(() => toast('Copied'))
    .catch(() => {
      document.getElementById('outputBox').select();
      document.execCommand('copy');
      toast('Copied');
    });
}

function toast(msg) {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}
