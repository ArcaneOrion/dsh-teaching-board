/** @arcaneorion/dsh-stage-panel — client 半（静态 bundle）。
 * 原生设计（单一数据流）：视图 = 会话快照的投影（消费最近一次 stage_panel /
 * stage_status / stage_choice 工具调用的参数，无轮询、无私有 RPC）；
 * 交互 = inputActions 发真实用户消息。
 *
 * client-modules 加载协议：bundle 必须通过 window.__ModuleLoader__.load({ id, factory })
 * 注册自己（id = 包名，须与 boot graph row 匹配）；factory 接收绑定到模块表的同步
 * require，一次性执行并返回模块导出（{ name, inject, apply }）。参照 dsh-context。
 */
window.__ModuleLoader__.load({
  id: '@arcaneorion/dsh-stage-panel',
  factory: (require) => {
    const { createElement, useEffect } = require('react')

    const CSS = `
.stgp-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.stgp-head { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-sidebar-fill); }
.stgp-title { font-weight: 700; color: var(--dsw-alias-label-primary); }
.stgp-state { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.stgp-ctx { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.stgp-body { flex: 1 1 auto; min-height: 0; position: relative; }
.stgp-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--dsw-alias-bg-base); }
.stgp-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--dsw-alias-label-secondary); font-size: 14px; }
.stgp-choices { flex: none; display: flex; flex-wrap: nowrap; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l2); overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%); }
.stgp-choice { flex: none; white-space: nowrap; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }
.stgp-choice:hover { border-color: var(--dsw-alias-brand-primary); }
`

    function parseArgs(raw) {
      try {
        const value = JSON.parse(raw)
        return value && typeof value === 'object' ? value : null
      } catch {
        return null
      }
    }

    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.stagePanelStyle = ''
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'stage-panel: styles')

      function StagePanelView(props) {
        const { useSession, inputActions } = props
        const latest = useSession((snapshot) => {
          let panel = null
          let status = null
          let choice = null
          for (const node of snapshot.nodes) {
            if (node.kind !== 'tool-result' || !node.call) continue
            const name = node.call.name
            if (name === 'stage_panel') panel = parseArgs(node.call.argsRaw)
            else if (name === 'stage_status') status = parseArgs(node.call.argsRaw)
            else if (name === 'stage_choice') choice = parseArgs(node.call.argsRaw)
          }
          return { panel, status, choice }
        })

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

        useEffect(() => {
          const onMessage = (event) => {
            const d = event.data
            if (d && d.localweb === true && d.type === 'panel_input' && typeof d.text === 'string') {
              send(d.text)
            }
          }
          window.addEventListener('message', onMessage)
          return () => window.removeEventListener('message', onMessage)
        }, [])

        const status = latest.status || null
        const choice = latest.choice || null
        const panel = latest.panel || null
        const options = choice && Array.isArray(choice.options) ? choice.options : []

        return createElement('div', { className: 'stgp-root' },
          createElement('div', { className: 'stgp-head' },
            createElement('span', { className: 'stgp-title' }, (status && status.title) || '面板'),
            createElement('span', { className: 'stgp-state' }, (status && status.state) || 'idle'),
            status && Array.isArray(status.context) ? status.context.map((c, i) =>
              createElement('span', { className: 'stgp-ctx', key: i }, `${c.label}: ${c.value}`)) : null,
          ),
          createElement('div', { className: 'stgp-body' },
            panel && typeof panel.html === 'string'
              ? createElement('iframe', {
                  className: 'stgp-frame',
                  sandbox: 'allow-scripts',
                  title: (panel && panel.title) || 'stage panel',
                  srcDoc: panel.html,
                })
              : createElement('div', { className: 'stgp-empty' }, '暂无面板 —— 让 agent 调用 stage_panel 渲染一个'),
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
        { name: 'conversation.view', id: 'stage-panel', order: 40, label: '面板' },
        (props) => createElement(StagePanelView, props),
      ))
    }

    return { name: 'stage-panel', inject: ['slots'], apply }
  },
})
