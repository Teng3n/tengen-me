(() => {
  const endpoint = 'wss://blizzard-forever-stock-monitor.teng3n.workers.dev/helper-stream';
  const protocol = 'forever-monitor-v1';
  function validCheck(message, now = Date.now()) {
    if (!message || message.type !== 'check' || message.v !== 1 || message.variant !== QueuePolicy.variant
        || !['available', 'unavailable', 'unknown'].includes(message.status)
        || !Number.isSafeInteger(message.epoch) || message.epoch < 0
        || ![true, false, null].includes(message.inventory)
        || !['enabled', 'disabled', 'missing', 'conflict'].includes(message.button)) return false;
    const checked = Date.parse(message.checkedAt), sent = Date.parse(message.sentAt);
    return Number.isFinite(checked) && Number.isFinite(sent) && sent >= checked
      && sent - checked <= 20000 && now - checked <= 20000 && checked - now <= 5000
      && now - sent <= 20000 && sent - now <= 5000;
  }
  function positive(message, now = Date.now()) {
    return validCheck(message, now) && message.status === 'available' && message.epoch > 0
      && message.healthy === true && message.inventory === true && message.button === 'enabled';
  }
  globalThis.DirectPolicy = { endpoint, protocol, validCheck, positive };
})();
