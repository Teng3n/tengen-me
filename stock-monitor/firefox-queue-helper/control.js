const $ = id => document.getElementById(id);
let audio;
let alarm = 0;
let lastTone = 0;
const send = message => browser.runtime.sendMessage(message);
function tone() {
  if (!audio || audio.state !== 'running') return;
  for (let i = 0; i < 3; i++) {
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    const t = audio.currentTime + i * 0.35;
    oscillator.frequency.value = i % 2 ? 880 : 660;
    volume.gain.setValueAtTime(0, t);
    volume.gain.linearRampToValueAtTime(0.18, t + .02);
    volume.gain.setValueAtTime(.18, t + .18);
    volume.gain.linearRampToValueAtTime(0, t + .25);
    oscillator.connect(volume); volume.connect(audio.destination);
    oscillator.start(t); oscillator.stop(t + .27);
  }
}
function guarded(fn) { return async () => { $('error').textContent = ''; try { await fn(); } catch (error) { $('error').textContent = error.message || 'Action failed. Reload the product tab and try again.'; } }; }
$('sound').onclick = guarded(async () => { audio ||= new AudioContext(); await audio.resume(); tone(); $('soundStatus').textContent = audio.state === 'running' ? 'Audio enabled — did you hear the three tones?' : 'Audio blocked — do not arm until the test works.'; });
$('silence').onclick = guarded(async () => { alarm = 0; await send({ type: 'silence' }); });
$('stop').onclick = guarded(async () => { await send({ type: 'stop' }); });
$('arm').onclick = guarded(async () => {
  await send({ type: 'arm', confirmEmpty: $('empty').checked,
    confirmRearm: $('rearm').checked, soundReady: audio?.state === 'running' });
  $('empty').checked = $('rearm').checked = false;
});
async function update() {
  try {
    const state = await send({ type: 'status' });
    $('phase').textContent = state.phase.toUpperCase(); $('reason').textContent = state.reason;
    $('last').textContent = state.lastCheck ? `Latest hosted check: ${new Date(state.lastCheck).toLocaleTimeString()}` : '';
    $('connection').textContent = state.connection + (state.connectionIssue ? ` — ${state.connectionIssue}` : '');
    $('network').textContent = (state.signal || 'Waiting for a hosted check.') + (state.lastCheck && !state.fresh ? ' — Evidence stale; no checkout can open.' : '');
    const describe = d => d ? `${new Date(d.at).toLocaleString()} — ${d.code}` : 'None recorded';
    $('diagnostic').textContent = `Last opening (${state.lastOpen?.kind || 'none'}): ${describe(state.lastOpen)}. Last checkout attempt: ${describe(state.lastCheckout)}.`;
    $('arm').disabled = ['watching', 'attempting'].includes(state.phase);
    alarm = state.alarm;
    if (alarm && Date.now() - lastTone >= 3000) { tone(); lastTone = Date.now(); }
    if (alarm && audio?.state !== 'running') $('soundStatus').textContent = 'ALARM — audio unavailable. Take over in the store tab.';
  } catch { $('error').textContent = 'Extension unavailable. Watching is not confirmed; reload/reinstall the extension.'; }
}
$('connect').onclick = guarded(async () => {
  const key = $('pairKey').value.trim();
  await send({ type: 'connect', key }); $('pairKey').value = '';
  $('pairStatus').textContent = 'Connecting. Wait for Connected before arming.';
});
$('pairFile').onchange = guarded(async () => {
  const file = $('pairFile').files[0];
  if (!file || file.size > 1024) throw new Error('Choose the small .helper.env pairing file.');
  const text = await file.text();
  const key = /^HELPER_TOKEN=([a-f0-9]{64})\r?$/m.exec(text)?.[1];
  if (!key) throw new Error('This is not the helper pairing file.');
  await send({ type: 'connect', key }); $('pairFile').value = '';
  $('pairStatus').textContent = 'Pairing file loaded. Wait for Connected.';
});
$('test').onclick = guarded(async () => { await send({ type: 'test' }); });
update(); setInterval(update, 1000);
