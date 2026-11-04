'use strict';
// Native, origin-scoped ownership. No document contents or credentials are broadcast.
(() => {
  const held = new Map(), pending = new Map();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('narabizagui.ownership.v1') : null;
  async function claim(key, { canRelease = () => false, onRelease = () => {} } = {}) {
    if (held.has(key)) { const lease=held.get(key);Object.assign(lease,{canRelease,onRelease});return lease; }
    if(pending.has(key))return pending.get(key);
    if (!navigator.locks) return null;
    let acquired;
    const ready = new Promise(resolve => { acquired = resolve; });
    pending.set(key,ready);
    navigator.locks.request('narabizagui:' + key, { ifAvailable: true }, async lock => {
      if (!lock) { acquired(null); return; }
      let unlock;
      const done = new Promise(resolve => { unlock = resolve; });
      const lease = { key, active: true, canRelease, onRelease, release(reason = 'closed') {
        if (!lease.active) return;
        lease.active = false; held.delete(key); unlock(); lease.onRelease(reason);
      } };
      held.set(key, lease); acquired(lease); await done;
    }).catch(() => acquired(null));
    try{return await ready;}finally{pending.delete(key);}
  }
  if (channel) channel.onmessage = ({ data }) => {
    if (data?.type !== 'release' || typeof data.key !== 'string' || data.key.length > 200) return;
    const lease = held.get(data.key);
    if (lease?.canRelease()) lease.release('transferred');
  };
  window.addEventListener('pagehide', () => { for (const lease of [...held.values()]) lease.release('pagehide'); });
  window.NaraTabOwnership = { claim, requestRelease: key => channel?.postMessage({ type: 'release', key }) };
})();
