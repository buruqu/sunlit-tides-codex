function mountDshPanelTransport(ctx, window) {
  const previous=window.__SUNLIT_PANEL_TRANSPORT__;
  // Symbol.for also recognizes a prior plugin factory during hot reload. Keep
  // lifetime metadata on our own objects so either disposal order can skip a
  // retired predecessor without losing a transport supplied by another owner.
  const lifetimeKey=Symbol.for('sunlit-tides.dsh.panel-transport.lifetime');
  const lifetime={previous,disposed:false};
  const listeners=new Set(), controller=new window.AbortController();
  const client=Array.from(window.crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');
  let disposed=false, polling=false, outbound=Promise.resolve();
  async function call(endpoint,payload={},signal=controller.signal) {
    const result=await ctx.connection.rpc.call('/sunlit-panel',endpoint,{client,...payload},signal);
    if (!result.ok) throw Error(result.error?.message || 'Native panel transport failed');
    return result.value;
  }
  function receive(message) { for (const listener of listeners) { try { listener(message); } catch (error) { window.console?.error('Native panel listener failed',error); } } }
  async function poll() {
    if (polling || disposed) return;
    polling=true;
    try { while (!disposed) { const events=await call('poll'); for (const event of events||[]) receive(event); } }
    catch (error) { if (!disposed) receive({type:'error',message:error.message}); }
    finally { polling=false; }
  }
  const transport={
    available:typeof ctx.connection?.rpc?.call === 'function',
    send(message) {
      const result=outbound.then(() => { if (disposed) throw Error('Panel transport disposed'); return call('send',{message}); });
      outbound=result.catch(() => {});
      result.then(() => { if (message.type === 'open') void poll(); },error => { if (!disposed) receive({type:'error',session:message.session,revision:message.revision,message:error.message}); });
      return result;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    receive,
  };
  Object.defineProperty(transport,lifetimeKey,{value:lifetime});
  window.__SUNLIT_PANEL_TRANSPORT__=transport;
  return () => {
    if(disposed)return;
    disposed=true; lifetime.disposed=true; transport.available=false; controller.abort(); listeners.clear();
    void call('release',{},new window.AbortController().signal).catch(() => {});
    if (window.__SUNLIT_PANEL_TRANSPORT__ === transport) {
      let restore=previous;
      while(restore?.[lifetimeKey]?.disposed)restore=restore[lifetimeKey].previous;
      if (restore) window.__SUNLIT_PANEL_TRANSPORT__=restore;
      else delete window.__SUNLIT_PANEL_TRANSPORT__;
    }
  };
}
