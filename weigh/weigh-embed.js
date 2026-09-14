/* weigh-embed.js — ตัวช่วยฝัง "ระบบชั่งวัดตวง" (weigh-system) ลงในเว็บอื่นแบบ iframe (vanilla JS ไม่พึ่งอะไร)
 *
 * ── แบบ A: ฝังในกล่องของหน้า (หน้าแม่ไม่ re-render DOM ทั้งหน้า) ──
 *   const w = WeighSystem.mount({ container:'#weighBox', src:'weigh/index.html', operator:'สมพล', branchId:'B03', role:'staff', onFinished:log=>{} });
 *
 * ── แบบ B (แนะนำสำหรับ SPA ที่เขียน innerHTML ใหม่ทั้งหน้าตอน navigate เช่น ระบบพนักงานหน้าสาขา) ──
 *   iframe ถูก mount "ครั้งเดียว" ไว้นอก root ของแอป แล้ว show/hide ทับตำแหน่งกล่องที่หน้าแม่วาดไว้
 *   → เครื่องชั่ง/เครื่องพิมพ์ไม่หลุดตอนสลับหน้า และชุดที่ชั่งค้างไม่หาย
 *   const w = WeighSystem.mount({ src:'weigh/index.html', operator:'สมพล', branchId:'B03', role:'staff', onFinished:log=>{} });   // ไม่ส่ง container = detached
 *   // ใน render() ของแอปแม่ ทุกครั้ง:  view==='staff.weigh' ? w.show(document.getElementById('weighSlot')) : w.hide();
 *   // หลัง login คนใหม่:              w.setOperator(S.user.name); w.send({ type:'config', branchId:S.user.branchId, role:S.user.role==='staff'?'staff':'manager' });
 *   // ตอน logout:                     w.hide()  (หรือ w.destroy() แล้ว mount ใหม่ตอน login)
 *
 * options: container? (element หรือ selector) · src (default 'weigh/index.html' — ต้องตรงชื่อโฟลเดอร์จริง)
 *          operator, lockOperator, branchId, role ('staff'|'manager'|'admin'|'viewer'), permissions, recipes, settings
 *          onReady(info) · onFinished(log) · onScale({connected,device}) · autoHeight (แบบ A เท่านั้น, default true) · minHeight (default 640)
 * คืน: { iframe, send(msg), selectRecipe({code|recipeId}), setOperator(name, lock), setRole(role, permissions), show(slotEl), hide(), destroy() }
 *
 * ⚠️ iframe ต้องมี allow="usb; bluetooth; serial; screen-wake-lock" (ใส่ให้แล้ว) · หน้าแม่ต้องเป็น HTTPS/localhost
 * ⚠️ ถ้า onReady ไม่ถูกเรียกภายใน ~3 วิ = path src ผิด (iframe ได้หน้า 404/SPA fallback แทน)
 */
(function(global){
  'use strict';
  function mount(opts){
    opts = opts || {};
    var container = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    var detached = !container;
    var src = opts.src || 'weigh/index.html';
    var iframe = document.createElement('iframe');
    iframe.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'embed=1';
    iframe.setAttribute('allow', 'usb; bluetooth; serial; screen-wake-lock');
    iframe.title = 'ระบบชั่งวัดตวง';
    var host = null, slot = null, raf = 0;
    if(detached){
      // host ลอยอยู่นอก root ของแอป — แอปแม่เขียน innerHTML ใหม่แค่ไหน iframe ก็ไม่โดน
      host = document.createElement('div');
      host.id = 'weighSystemHost';
      host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;display:none;z-index:50;background:#f1f5f9;overflow:hidden';
      iframe.style.cssText = 'width:100%;height:100%;border:0;display:block';
      host.appendChild(iframe);
      document.body.appendChild(host);
    } else {
      iframe.style.cssText = 'width:100%;border:0;display:block;min-height:' + (opts.minHeight || 640) + 'px;background:#f1f5f9';
    }
    var ready = false, queue = [];
    function post(msg){
      var m = Object.assign({ target:'weigh-system' }, msg);
      if(!ready){ queue.push(m); return; }
      try { iframe.contentWindow.postMessage(m, '*'); } catch(e){}
    }
    function onMsg(ev){
      if(!ev.source || ev.source !== iframe.contentWindow) return;
      var d = ev.data; if(!d || d.source !== 'weigh-system') return;
      if(d.type === 'ready'){
        ready = true;
        var cfg = {};
        ['operator','lockOperator','branchId','role','permissions','recipes','settings'].forEach(function(k){ if(opts[k] != null) cfg[k] = opts[k]; });
        if(Object.keys(cfg).length) post(Object.assign({ type:'config' }, cfg));
        queue.splice(0).forEach(function(m){ try { iframe.contentWindow.postMessage(m, '*'); } catch(e){} });
        opts.onReady && opts.onReady({ version: d.version });
      } else if(d.type === 'finished'){ opts.onFinished && opts.onFinished(d.log); }
      else if(d.type === 'scale'){ opts.onScale && opts.onScale({ connected: d.connected, device: d.device }); }
      else if(d.type === 'height'){ if(!detached && opts.autoHeight !== false && d.px > 0) iframe.style.height = Math.max(opts.minHeight || 640, d.px + 8) + 'px'; }
    }
    global.addEventListener('message', onMsg);
    if(!detached) container.appendChild(iframe);

    // ---- detached: วาง host ทับกล่อง slot ที่แอปแม่วาดไว้ (ตามตำแหน่งจริงทุกเฟรม) ----
    function sync(){
      if(!host || !slot || !slot.isConnected){ if(host && slot && !slot.isConnected) hide(); return; }
      var r = slot.getBoundingClientRect();
      host.style.left = r.left + 'px'; host.style.top = r.top + 'px';
      host.style.width = r.width + 'px'; host.style.height = Math.max(r.height, opts.minHeight || 0) + 'px';
      raf = global.requestAnimationFrame(sync);
    }
    function show(slotEl){
      if(!host) return;
      slot = typeof slotEl === 'string' ? document.querySelector(slotEl) : slotEl;
      if(!slot) return;
      host.style.display = 'block';
      if(!raf) sync();
    }
    function hide(){
      if(!host) return;
      host.style.display = 'none'; slot = null;
      if(raf){ global.cancelAnimationFrame(raf); raf = 0; }
    }
    return {
      iframe: iframe,
      send: post,
      selectRecipe: function(sel){ post(Object.assign({ type:'select-recipe' }, sel || {})); },
      setOperator: function(name, lock){ post({ type:'config', operator:name, lockOperator: lock !== false }); },
      setRole: function(role, permissions){ post({ type:'config', role:role, permissions:permissions }); },
      show: show, hide: hide, isDetached: detached,
      destroy: function(){ hide(); global.removeEventListener('message', onMsg); try { (host || iframe).remove(); } catch(e){} },
    };
  }
  global.WeighSystem = { mount: mount };
})(window);
