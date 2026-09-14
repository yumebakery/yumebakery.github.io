/* weigh-embed.js — ตัวช่วยฝัง "ระบบชั่งวัดตวง" (weigh-system) ลงในเว็บอื่นแบบ iframe (vanilla JS ไม่พึ่งอะไร)
 *
 *   <script src="weigh/weigh-embed.js"></script>
 *   const w = WeighSystem.mount({
 *     container: document.getElementById('weighBox'),   // element ที่จะใส่ iframe
 *     src: 'weigh/index.html',                            // path ของ index.html ในแพ็กเกจ (default)
 *     operator: 'สมพล', lockOperator: true,               // ชื่อผู้ชั่งจาก login ของแอปแม่ (ล็อกไม่ให้แก้)
 *     branchId: 'B03',                                    // ติดไปกับ log ทุกชุด
 *     recipes: [...],                                     // (ไม่บังคับ) สูตรจากแอปแม่ — รวมตาม id กับที่มีในเครื่อง
 *     settings: { usbAutoPrint: true },                   // (ไม่บังคับ) ทับค่าตั้งค่า
 *     onReady: (info) => {},                              // iframe โหลดเสร็จ
 *     onFinished: (log) => {},                            // ชั่งครบ 1 ชุด → log (สูตร/LOT/รายการ/น้ำหนัก/ผู้ชั่ง/branchId)
 *     onScale: (s) => {},                                 // เครื่องชั่งต่อ/หลุด {connected, device}
 *     autoHeight: true,                                   // ปรับความสูง iframe ตามเนื้อหา (default true)
 *   });
 *   w.selectRecipe({ code:'BRD' });   // สั่งเลือกสูตรจากแอปแม่ (ใช้ code หรือ recipeId)
 *   w.send({ type:'config', operator:'คนใหม่' });
 *   w.destroy();
 *
 * ⚠️ ต้องมี allow="usb; bluetooth; serial; screen-wake-lock" บน iframe (ใส่ให้แล้ว) ไม่งั้นต่อเครื่องชั่ง/เครื่องพิมพ์ในกรอบไม่ได้
 * ⚠️ หน้าแม่ต้องเป็น HTTPS (หรือ localhost) — Web Bluetooth/WebUSB ไม่ทำงานบน http://
 */
(function(global){
  'use strict';
  function mount(opts){
    opts = opts || {};
    var container = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if(!container) throw new Error('WeighSystem.mount: ไม่พบ container');
    var iframe = document.createElement('iframe');
    var src = opts.src || 'weigh/index.html';
    iframe.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'embed=1';
    iframe.setAttribute('allow', 'usb; bluetooth; serial; screen-wake-lock');
    iframe.style.cssText = 'width:100%;border:0;display:block;min-height:' + (opts.minHeight || 640) + 'px;background:#f1f5f9';
    iframe.title = 'ระบบชั่งวัดตวง';
    var ready = false, queue = [];
    function post(msg){
      var m = Object.assign({ target:'weigh-system' }, msg);
      if(!ready){ queue.push(m); return; }
      try { iframe.contentWindow.postMessage(m, '*'); } catch(e){}
    }
    function onMsg(ev){
      if(ev.source !== iframe.contentWindow) return;
      var d = ev.data; if(!d || d.source !== 'weigh-system') return;
      if(d.type === 'ready'){
        ready = true;
        var cfg = {};
        ['operator','lockOperator','branchId','recipes','settings'].forEach(function(k){ if(opts[k] != null) cfg[k] = opts[k]; });
        if(Object.keys(cfg).length) post(Object.assign({ type:'config' }, cfg));
        queue.splice(0).forEach(function(m){ try { iframe.contentWindow.postMessage(m, '*'); } catch(e){} });
        opts.onReady && opts.onReady({ version: d.version });
      } else if(d.type === 'finished'){ opts.onFinished && opts.onFinished(d.log); }
      else if(d.type === 'scale'){ opts.onScale && opts.onScale({ connected: d.connected, device: d.device }); }
      else if(d.type === 'height'){ if(opts.autoHeight !== false && d.px > 0) iframe.style.height = Math.max(opts.minHeight || 640, d.px + 8) + 'px'; }
    }
    global.addEventListener('message', onMsg);
    container.appendChild(iframe);
    return {
      iframe: iframe,
      send: post,
      selectRecipe: function(sel){ post(Object.assign({ type:'select-recipe' }, sel || {})); },
      setOperator: function(name, lock){ post({ type:'config', operator:name, lockOperator: lock !== false }); },
      destroy: function(){ global.removeEventListener('message', onMsg); try { iframe.remove(); } catch(e){} },
    };
  }
  global.WeighSystem = { mount: mount };
})(window);
