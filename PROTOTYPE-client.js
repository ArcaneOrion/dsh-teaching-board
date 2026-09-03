/**
 * @arcaneorion/dsh-localweb — 动态原型 client 半（逐字来自 lwst-2/pkg-5，已验证）。
 * 依赖动态 runner 内置（React / host / styles）与 inject:['timer','slots']；
 * 静态 bundle 化见 ../README.md §6.3。
 */
export function applyPrototype(ctx) {
  styles.insert(`
    .lwst-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .lwst-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 2px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-sidebar-fill); }
    .lwst-title { font-weight: 700; color: var(--dsw-alias-label-primary); }
    .lwst-state { font-size: 12px; color: var(--dsw-alias-label-secondary); }
    .lwst-ctx { font-size: 12px; color: var(--dsw-alias-label-secondary); }
    .lwst-body { flex: 1 1 auto; min-height: 0; position: relative; }
    .lwst-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--dsw-alias-bg-base); }
    .lwst-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--dsw-alias-label-secondary); font-size: 14px; }
    .lwst-choices { flex: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px; border-top: 2px solid var(--dsw-alias-border-l2); }
    .lwst-choice { border: 1.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }
    .lwst-choice:hover { border-color: var(--dsw-alias-brand-primary); }
  `)

  function StageView(props) {
    const [data, setData] = React.useState(null)
    React.useEffect(() => {
      let alive = true
      const tick = () => {
        host.call('lw:get').then((d) => { if (alive) setData(d) }).catch(() => {})
      }
      tick()
      const dispose = ctx.interval(tick, 1500)
      return () => { alive = false; dispose() }
    }, [])

    React.useEffect(() => {
      const onMessage = (event) => {
        const d = event.data
        if (d && d.localweb === true && d.type === 'panel_input' && typeof d.input_id === 'string') {
          host.call('lw:submit', { kind: 'panel_input', id: d.input_id, text: typeof d.text === 'string' ? d.text : null }).catch(() => {})
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [])

    const status = data ? data.status : null
    const panel = data ? data.panel : null
    const choices = data && data.choices && Array.isArray(data.choices.options) ? data.choices.options : []
    const choiceId = data && data.choices ? data.choices.id : null

    const submitChoice = (option) => {
      host.call('lw:submit', { kind: 'choice', id: choiceId, value: option.id }).catch(() => {})
    }

    return React.createElement('div', { className: 'lwst-root' },
      React.createElement('div', { className: 'lwst-head' },
        React.createElement('span', { className: 'lwst-title' }, (status && status.title) || '面板舞台'),
        React.createElement('span', { className: 'lwst-state' }, (status && status.state) || 'idle'),
        status && Array.isArray(status.context) ? status.context.map((c, i) =>
          React.createElement('span', { className: 'lwst-ctx', key: i }, `${c.label}: ${c.value}`)) : null,
      ),
      React.createElement('div', { className: 'lwst-body' },
        panel && panel.html
          ? React.createElement('iframe', { className: 'lwst-frame', sandbox: 'allow-scripts', title: (panel && panel.title) || 'localweb panel', srcDoc: panel.html })
          : React.createElement('div', { className: 'lwst-empty' }, '暂无面板 —— 让 agent 调用 lw_panel 渲染一个'),
      ),
      choices.length > 0
        ? React.createElement('div', { className: 'lwst-choices' },
            choices.map((o) => React.createElement('button', { className: 'lwst-choice', key: o.id, onClick: () => submitChoice(o) }, o.label)))
        : null,
    )
  }

  ctx.slots.inject('conversation.view', () => ctx.slots.register(
    { name: 'conversation.view', id: 'localweb', order: 40, label: '面板' },
    (props) => React.createElement(StageView, props),
  ))
}
