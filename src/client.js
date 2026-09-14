/** @arcaneorion/dsh-teaching-board — client 半（静态 bundle）。
 *
 * 定位：会话内「教学平面」——板书展示 + 手写勾画 + 内置截图。
 *
 * 原生设计（单一数据流）：视图 = 会话快照的投影（消费最近一次 stage_panel /
 * stage_status / stage_choice / stage_snapshot 工具调用，无轮询、无私有 RPC）；
 * 交互 = inputActions 发真实用户消息。
 *
 * 两个硬约束决定了这里的架构：
 *  1) 面板 iframe 是 sandbox="allow-scripts"（无 allow-same-origin）→ 父页面永远读不到
 *     面板内部 DOM，也截不了它的图。所以勾画与光栅化都必须在 iframe 内部完成：
 *     我们把一段 runtime 注入进面板 HTML，父层只通过 postMessage 下命令。
 *  2) 静态 bundle 无法注册自定义 Remote，宿主拿不到浏览器里的像素 → 截图只能经产品
 *     既有的用户输入通道回来（草稿图片 + 提交），而不是塞进工具结果。
 *
 * client-modules 加载协议：bundle 必须通过 window.__ModuleLoader__.load({ id, factory })
 * 注册自己（id = 包名，须与 boot graph row 匹配）；factory 接收绑定到模块表的同步
 * require，一次性执行并返回模块导出（{ name, inject, apply }）。参照 dsh-context。
 */
window.__ModuleLoader__.load({
  id: '@arcaneorion/dsh-teaching-board',
  factory: (require) => {
    const { createElement, useEffect, useMemo, useRef, useState } = require('react')

    const CSS = `
.stgp-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.stgp-head { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-sidebar-fill); }
.stgp-title { font-weight: 700; color: var(--dsw-alias-label-primary); }
.stgp-state { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.stgp-ctx { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.stgp-tools { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-wrap: wrap; }
.stgp-tool { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.stgp-tool:hover { border-color: var(--dsw-alias-brand-primary); }
.stgp-tool.on { background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.stgp-tool.primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.stgp-sw { width: 16px; height: 16px; border-radius: 50%; border: 2px solid transparent; box-shadow: 0 0 0 1px var(--dsw-alias-border-l2); cursor: pointer; padding: 0; }
.stgp-sw.on { box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary); }
.stgp-size { width: 62px; }
.stgp-count { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 42px; }
.stgp-body { flex: 1 1 auto; min-height: 0; position: relative; }
.stgp-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--dsw-alias-bg-base); }
.stgp-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--dsw-alias-label-secondary); font-size: 14px; }
.stgp-toast { position: absolute; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 5; max-width: 88%;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px; padding: 6px 16px; font-size: 12.5px; box-shadow: 0 8px 24px rgba(0,0,0,.16); }
.stgp-choices { flex: none; display: flex; flex-wrap: nowrap; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l2); overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%); }
.stgp-choice { flex: none; white-space: nowrap; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }
.stgp-choice:hover { border-color: var(--dsw-alias-brand-primary); }
`

    const COLORS = ['#e5484d', '#2f6feb', '#1a7f37', '#111827']

    /** 注入面板文档的 runtime：勾画层 + 光栅化截图。零依赖、零外网。 */
    const RUNTIME = `
(function () {
  if (window.__stagePanelInk) return;
  var P = { mode: 'off', color: '#e5484d', size: 3 };
  var strokes = [], cur = null, drawing = false;
  var MAX_BYTES = 1200 * 1024;

  function send(m) { try { parent.postMessage(m, '*'); } catch (e) {} }

  var cv = document.createElement('canvas');
  cv.setAttribute('data-stage-ink', '');
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;pointer-events:none;touch-action:none;';
  (document.body || document.documentElement).appendChild(cv);
  var g = cv.getContext('2d');

  function dpr() { return window.devicePixelRatio || 1; }
  function fit() {
    var d = dpr();
    cv.width = Math.max(1, Math.round(window.innerWidth * d));
    cv.height = Math.max(1, Math.round(window.innerHeight * d));
    redraw();
  }
  function paintStroke(s) {
    g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    g.strokeStyle = s.color;
    g.lineWidth = s.erase ? s.size * 5 : s.size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (var i = 0; i < s.pts.length; i++) {
      if (i === 0) g.moveTo(s.pts[i][0], s.pts[i][1]); else g.lineTo(s.pts[i][0], s.pts[i][1]);
    }
    if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }
  function redraw() {
    var d = dpr();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    for (var i = 0; i < strokes.length; i++) paintStroke(strokes[i]);
    if (cur) paintStroke(cur);
  }
  function count() { send({ __stagePanel: true, type: 'ink', strokes: strokes.length }); }

  cv.addEventListener('pointerdown', function (e) {
    if (P.mode === 'off') return;
    drawing = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    cur = { color: P.color, size: P.size, erase: P.mode === 'erase', pts: [[e.clientX, e.clientY]] };
    redraw();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    cur.pts.push([e.clientX, e.clientY]);
    redraw();
  });
  function end() {
    if (!drawing) return;
    drawing = false;
    strokes.push(cur);
    cur = null;
    redraw();
    count();
  }
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  /** 克隆自身文档，把每个 canvas 换成它自己的位图，再交给 foreignObject 光栅化。 */
  function rasterize() {
    return new Promise(function (resolve, reject) {
      var w = Math.max(1, Math.round(window.innerWidth));
      var h = Math.max(1, Math.round(window.innerHeight));
      var clone = document.documentElement.cloneNode(true);
      var drop = clone.querySelectorAll('[data-stage-capture-ignore]');
      for (var d = 0; d < drop.length; d++) drop[d].parentNode.removeChild(drop[d]);
      var srcs = document.querySelectorAll('canvas');
      var dsts = clone.querySelectorAll('canvas');
      for (var i = 0; i < srcs.length && i < dsts.length; i++) {
        var st = window.getComputedStyle(srcs[i]);
        var im = document.createElement('img');
        try { im.setAttribute('src', srcs[i].toDataURL('image/png')); } catch (e) { continue; }
        im.setAttribute('style', 'position:fixed;left:' + st.left + ';top:' + st.top +
          ';width:' + st.width + ';height:' + st.height + ';');
        dsts[i].parentNode.replaceChild(im, dsts[i]);
      }
      var xml = new XMLSerializer().serializeToString(clone);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
        '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject x="0" y="0" width="' + w + '" height="' + h +
        '">' + xml + '</foreignObject></svg>';
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        var cc = c.getContext('2d');
        cc.fillStyle = '#ffffff';
        cc.fillRect(0, 0, w, h);
        cc.drawImage(img, 0, 0, w, h);
        resolve(c);
      };
      img.onerror = function () { reject(new Error('foreignObject 光栅化失败')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /** PNG 优先；超过模型单图预算就退到 JPEG，再不行等比缩小。 */
  function encode(c) {
    var out = c.toDataURL('image/png');
    if (out.length * 0.75 <= MAX_BYTES) return out;
    out = c.toDataURL('image/jpeg', 0.85);
    if (out.length * 0.75 <= MAX_BYTES) return out;
    var scale = Math.sqrt(MAX_BYTES / (out.length * 0.75));
    var c2 = document.createElement('canvas');
    c2.width = Math.max(1, Math.round(c.width * scale));
    c2.height = Math.max(1, Math.round(c.height * scale));
    c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height);
    return c2.toDataURL('image/jpeg', 0.85);
  }

  function capture(meta) {
    meta = meta || {};
    rasterize().then(function (c) {
      send({
        __stagePanel: true, type: 'capture', ok: true, dataUrl: encode(c),
        w: c.width, h: c.height, strokes: strokes.length,
        auto: meta.auto === true, requestId: meta.requestId || null,
      });
    }).catch(function (e) {
      send({
        __stagePanel: true, type: 'capture', ok: false, error: String(e && e.message || e),
        auto: meta.auto === true, requestId: meta.requestId || null,
      });
    });
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__stagePanel !== true || typeof d.cmd !== 'string') return;
    if (d.cmd === 'mode') {
      P.mode = d.value === 'pen' || d.value === 'erase' ? d.value : 'off';
      cv.style.pointerEvents = P.mode === 'off' ? 'none' : 'auto';
      cv.style.cursor = P.mode === 'erase' ? 'cell' : 'crosshair';
    } else if (d.cmd === 'color') {
      P.color = String(d.value || P.color);
    } else if (d.cmd === 'size') {
      P.size = Number(d.value) || P.size;
    } else if (d.cmd === 'undo') {
      strokes.pop();
      redraw();
      count();
    } else if (d.cmd === 'clear') {
      strokes = [];
      redraw();
      count();
    } else if (d.cmd === 'capture') {
      capture({ auto: d.auto === true, requestId: d.requestId || null });
    } else if (d.cmd === 'ping') {
      send({ __stagePanel: true, type: 'ready' });
    }
  });

  window.addEventListener('resize', fit);
  fit();
  count();
  send({ __stagePanel: true, type: 'ready' });
  window.__stagePanelInk = { capture: capture, count: function () { return strokes.length; } };
})();
`

    /** 把 runtime 注入面板 HTML；没有 </body> 就追加在末尾。 */
    function injectRuntime(html) {
      const tag = '<script data-stage-runtime>' + RUNTIME + '<\/script>'
      if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, tag + '</body>')
      if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, tag + '</html>')
      return html + tag
    }

    function parseArgs(raw) {
      try {
        const value = JSON.parse(raw)
        return value && typeof value === 'object' ? value : null
      } catch {
        return null
      }
    }

    /** data:image/...;base64,xxx → File（走产品既有的草稿图片通道）。 */
    function dataUrlToFile(dataUrl, name) {
      const comma = dataUrl.indexOf(',')
      const head = dataUrl.slice(0, comma)
      const type = (head.match(/^data:([^;]+)/) || [])[1] || 'image/png'
      const binary = atob(dataUrl.slice(comma + 1))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new File([bytes], name, { type })
    }

    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.stagePanelStyle = ''
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'teaching-board: styles')

      function StagePanelView(props) {
        const { useSession, useInput, inputActions } = props
        const latest = useSession((snapshot) => {
          let panel = null
          let status = null
          let choice = null
          let snapReq = null
          for (const node of snapshot.nodes) {
            if (!node) continue
            const call = node.call || null
            const name = (call && call.name) || node.name || null
            if (name === 'stage_snapshot') {
              // 工具调用先于结果出现；用 callId 去重，保证每个请求只截一次。
              const callId = node.callId || (call && call.callId) || null
              if (callId) {
                const args = parseArgs(node.argsRaw || (call && call.argsRaw) || '')
                snapReq = { callId, note: args && typeof args.note === 'string' ? args.note : '' }
              }
            }
            if (node.kind !== 'tool-result' || !call) continue
            if (call.name === 'stage_panel') panel = parseArgs(call.argsRaw)
            else if (call.name === 'stage_status') status = parseArgs(call.argsRaw)
            else if (call.name === 'stage_choice') choice = parseArgs(call.argsRaw)
          }
          return { panel, status, choice, snapReq }
        })

        const frameRef = useRef(null)
        const handledRef = useRef(new Set())
        const warnedRef = useRef(new Set())
        const toolRef = useRef({ mode: 'off', color: COLORS[0], size: 3 })
        const [tool, setTool] = useState(toolRef.current)
        const [strokes, setStrokes] = useState(0)
        const [toast, setToast] = useState('')

        const status = latest.status || null
        const choice = latest.choice || null
        const panel = latest.panel || null
        const options = choice && Array.isArray(choice.options) ? choice.options : []
        const html = panel && typeof panel.html === 'string' ? panel.html : null
        const srcDoc = useMemo(() => (html === null ? null : injectRuntime(html)), [html])

        // 输入框是否空闲。agent 主动截图只在空闲时替用户提交——否则会把人家正在写的
        // 草稿一起发出去。hook 必须在组件顶层调用，结果存进 ref 供消息监听器
        // （那个闭包早于后续渲染）读到最新值。
        const useInputSafe = typeof useInput === 'function' ? useInput : null
        const idleNow = useInputSafe
          ? useInputSafe((s) => s.draft === '' && (Array.isArray(s.imageIds) ? s.imageIds.length === 0 : true))
          : true
        const idleRef = useRef(true)
        idleRef.current = idleNow !== false

        const send = (text) => {
          try {
            if (inputActions) {
              inputActions.setDraft(text)
              inputActions.submit()
            }
          } catch {
            /* 提交失败仅静默，不阻塞视图 */
          }
        }

        const post = (msg) => {
          const frame = frameRef.current
          if (frame && frame.contentWindow) {
            try { frame.contentWindow.postMessage({ __stagePanel: true, ...msg }, '*') } catch { /* 面板已卸载 */ }
          }
        }

        const flash = (text) => {
          setToast(text)
          window.setTimeout(() => setToast((cur) => (cur === text ? '' : cur)), 3600)
        }

        /** 截图 → 草稿图片；auto=true 时再替用户提交（agent 主动请求的路径）。 */
        const deliver = (dataUrl, auto, note) => {
          const conversation = ctx.get('conversation')
          if (!conversation || typeof conversation.createDraftImages !== 'function') {
            flash('截图成功，但 conversation 服务不可用，无法放入输入框')
            return
          }
          if (!inputActions || typeof inputActions.addImages !== 'function') {
            flash('截图成功，但输入框不可用，无法放入草稿')
            return
          }
          let ids
          try {
            const file = dataUrlToFile(dataUrl, `stage-panel-${Date.now()}.png`)
            const created = conversation.createDraftImages([file])
            ids = (created || []).map((a) => a.id)
          } catch (error) {
            flash('截图已生成，但附件创建失败：' + (error && error.message ? error.message : error))
            return
          }
          if (ids.length === 0) {
            flash('截图已生成，但附件创建失败')
            return
          }
          // 提交阶段可能短暂拒绝（admission/claim 中），退避重试几次再放弃。
          const attempt = (left) => {
            let accepted = false
            try { accepted = inputActions.addImages(ids) } catch { accepted = false }
            if (accepted) {
              if (auto) {
                if (!idleRef.current) {
                  // 用户正在写东西：只放入口，不替他按回车。
                  flash('agent 请求了这个板面的截图：已放入输入框（你正在输入，没有自动发送）')
                  return
                }
                try {
                  if (note) inputActions.setDraft(note)
                  inputActions.submit()
                  flash('已把面板截图发回会话')
                } catch {
                  flash('截图已放入输入框，但自动发送失败，请手动回车')
                }
              } else {
                flash('截图已放入输入框 —— 补充一句说明后回车发送')
              }
              return
            }
            if (left <= 1) {
              flash('截图已生成，但输入框当前拒绝图片（可能在忙或超限）')
              return
            }
            window.setTimeout(() => attempt(left - 1), 700)
          }
          attempt(5)
        }

        useEffect(() => {
          const onMessage = (event) => {
            const d = event.data
            if (!d) return
            if (d.__stagePanel === true) {
              if (d.type === 'capture') {
                if (d.ok === true && typeof d.dataUrl === 'string') {
                  deliver(d.dataUrl, d.auto === true, d.note || '')
                } else {
                  flash('截图失败：' + (d.error || '未知原因'))
                }
              } else if (d.type === 'ink') {
                setStrokes(Number(d.strokes) || 0)
              } else if (d.type === 'ready') {
                // iframe 刚载入：把当前工具状态推回去（用 ref 避免闭包过期）。
                const t = toolRef.current
                post({ cmd: 'mode', value: t.mode })
                post({ cmd: 'color', value: t.color })
                post({ cmd: 'size', value: t.size })
              }
              return
            }
            if (d.localweb === true && d.type === 'panel_input' && typeof d.text === 'string') {
              send(d.text)
            }
          }
          window.addEventListener('message', onMessage)
          return () => window.removeEventListener('message', onMessage)
        }, [])

        // agent 主动截图：快照里出现未处理的 stage_snapshot 调用就拍一张。
        // 面板没挂载时不标记已处理，等它挂上再拍。
        useEffect(() => {
          const req = latest.snapReq
          if (!req || !req.callId) return
          if (handledRef.current.has(req.callId)) return
          if (srcDoc === null) {
            if (!warnedRef.current.has(req.callId)) {
              warnedRef.current.add(req.callId)
              flash('agent 请求截图，但面板未打开 —— 请切到「面板」页签')
            }
            return
          }
          handledRef.current.add(req.callId)
          post({ cmd: 'capture', auto: true, requestId: req.callId, note: req.note })
        }, [latest.snapReq && latest.snapReq.callId, srcDoc])

        const setMode = (mode) => {
          const next = tool.mode === mode ? 'off' : mode
          toolRef.current = { ...toolRef.current, mode: next }
          setTool(toolRef.current)
          post({ cmd: 'mode', value: next })
        }

        return createElement('div', { className: 'stgp-root' },
          createElement('div', { className: 'stgp-head' },
            createElement('span', { className: 'stgp-title' }, (status && status.title) || '教学平面'),
            createElement('span', { className: 'stgp-state' }, (status && status.state) || 'idle'),
            status && Array.isArray(status.context) ? status.context.map((c, i) =>
              createElement('span', { className: 'stgp-ctx', key: i }, `${c.label}: ${c.value}`)) : null,
            createElement('div', { className: 'stgp-tools' },
              createElement('button', { className: 'stgp-tool' + (tool.mode === 'pen' ? ' on' : ''), onClick: () => setMode('pen') }, '画笔'),
              createElement('button', { className: 'stgp-tool' + (tool.mode === 'erase' ? ' on' : ''), onClick: () => setMode('erase') }, '橡皮'),
              COLORS.map((c) => createElement('button', {
                key: c,
                className: 'stgp-sw' + (tool.color === c ? ' on' : ''),
                style: { background: c },
                title: c,
                onClick: () => {
                  toolRef.current = { ...toolRef.current, color: c }
                  setTool(toolRef.current)
                  post({ cmd: 'color', value: c })
                },
              })),
              createElement('input', {
                className: 'stgp-size', type: 'range', min: 1, max: 14, value: tool.size,
                onChange: (e) => {
                  const v = Number(e.target.value)
                  toolRef.current = { ...toolRef.current, size: v }
                  setTool(toolRef.current)
                  post({ cmd: 'size', value: v })
                },
              }),
              createElement('button', { className: 'stgp-tool', onClick: () => post({ cmd: 'undo' }) }, '撤销'),
              createElement('button', { className: 'stgp-tool', onClick: () => post({ cmd: 'clear' }) }, '清空'),
              createElement('span', { className: 'stgp-count' }, strokes + ' 笔'),
              createElement('button', { className: 'stgp-tool primary', onClick: () => post({ cmd: 'capture', auto: false }) }, '截图'),
            ),
          ),
          createElement('div', { className: 'stgp-body' },
            srcDoc !== null
              ? createElement('iframe', {
                  ref: frameRef,
                  className: 'stgp-frame',
                  sandbox: 'allow-scripts',
                  title: (panel && panel.title) || 'stage panel',
                  srcDoc,
                })
              : createElement('div', { className: 'stgp-empty' }, '暂无板书 —— 让 agent 调用 stage_panel 渲染一个'),
            toast ? createElement('div', { className: 'stgp-toast' }, toast) : null,
          ),
          options.length > 0
            ? createElement('div', { className: 'stgp-choices' },
                options.map((o) => createElement('button', {
                  className: 'stgp-choice',
                  key: o.id,
                  onClick: () => send(`[面板选择] ${o.label}`),
                }, o.label)))
            : null,
        )
      }

      ctx.slots.inject('conversation.view', () => ctx.slots.register(
        { name: 'conversation.view', id: 'stage-panel', order: 40, label: '教学平面' },
        (props) => createElement(StagePanelView, props),
      ))
    }

    return { name: 'teaching-board', inject: ['slots'], apply }
  },
})
