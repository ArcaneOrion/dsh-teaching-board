/**
 * @arcaneorion/dsh-localweb — 动态原型 host 半（逐字来自 lwst-2/pkg-5，已验证）。
 * 此形态依赖动态 runner 的 harness 内置与 inject:['timer']；
 * 静态 bundle 化见 ../README.md §6.3。
 */
export function applyPrototype(ctx) {
  const state = {
    panel: { html: '', title: null, updatedAt: 0 },
    status: { title: null, state: 'idle', context: [] },
    choices: { id: null, options: [] },
  }
  const inbox = []
  const waiters = new Map()
  const settle = (entry) => {
    const waiter = waiters.get(entry.id)
    if (waiter !== undefined) {
      waiters.delete(entry.id)
      waiter(entry)
    }
  }

  harness.handle('lw:get', async () => ({
    panel: state.panel,
    status: state.status,
    choices: state.choices,
  }))

  harness.handle('lw:submit', async (args) => {
    if (args === null || typeof args !== 'object' || typeof args.id !== 'string') {
      return { ok: false, error: 'missing id' }
    }
    const entry = {
      id: args.id,
      kind: args.kind === 'panel_input' ? 'panel_input' : 'choice',
      value: typeof args.value === 'string' ? args.value : null,
      text: typeof args.text === 'string' ? args.text : null,
      ts: Date.now(),
    }
    inbox.push(entry)
    settle(entry)
    return { ok: true }
  })

  const textRender = (_args, value) => [{ type: 'text', text: value }]
  const makeTool = (name, description, parameters, execute) =>
    harness.defineTool({ name, description, parameters, output: { schema: { type: 'string' }, render: textRender }, execute })

  harness.registerTool(ctx, makeTool(
    'lw_panel',
    '把一份 self-contained HTML 投影到会话「面板」视图的舞台（沙箱 iframe 渲染）。先由 Agent 生成完整 HTML（内联 CSS/JS，不依赖外网），再调用本工具。若面板内含 postMessage 回传（{localweb:true,type:"panel_input",input_id,text}），请传 waitId，并随后调用 lw_wait 消费回传。',
    {
      html: { type: 'string', required: true, description: '完整 self-contained HTML 文档字符串' },
      title: { type: 'string', description: '面板标题（显示在舞台状态条）' },
      waitId: { type: 'string', description: '面板回传输入 id；声明后需调用 lw_wait' },
    },
    async (args) => {
      state.panel = { html: args.html, title: typeof args.title === 'string' ? args.title : null, updatedAt: Date.now() }
      state.choices = { id: null, options: [] }
      return JSON.stringify({ ok: true, title: state.panel.title, nextCommand: args.waitId ? 'lw_wait id=' + args.waitId + ' type=panel' : null })
    },
  ))

  harness.registerTool(ctx, makeTool(
    'lw_status',
    '更新「面板」视图的状态条与上下文信息（任务、阶段、等待态等）。',
    {
      title: { type: 'string', description: '状态条标题' },
      state: { type: 'string', description: '状态：idle / working / waiting_for_user / done' },
      context: { type: 'array', description: '上下文行数组 [{label,value}]' },
    },
    async (args) => {
      const next = { ...state.status }
      if (typeof args.title === 'string') next.title = args.title
      if (typeof args.state === 'string') next.state = args.state
      if (Array.isArray(args.context)) {
        next.context = args.context
          .filter((c) => c && typeof c.label === 'string')
          .map((c) => ({ label: c.label, value: typeof c.value === 'string' ? c.value : '' }))
      }
      state.status = next
      return JSON.stringify({ ok: true, status: state.status })
    },
  ))

  harness.registerTool(ctx, makeTool(
    'lw_choice',
    '在「面板」视图底部发布方向选项（choice 栏）。发布后必须调用 lw_wait id=<id> 消费用户选择，保持 CLI 回合打开。',
    {
      id: { type: 'string', required: true, description: 'choice 组 id' },
      options: { type: 'array', required: true, description: '[{id,label}] 选项数组' },
    },
    async (args) => {
      const opts = Array.isArray(args.options)
        ? args.options.filter((o) => o && typeof o.id === 'string').map((o) => ({ id: o.id, label: typeof o.label === 'string' ? o.label : o.id }))
        : []
      state.choices = { id: args.id, options: opts }
      for (let i = inbox.length - 1; i >= 0; i--) {
        if (inbox[i].id === args.id) inbox.splice(i, 1)
      }
      return JSON.stringify({ ok: true, choiceId: args.id, waitRequired: true, nextCommand: 'lw_wait id=' + args.id + ' type=choice' })
    },
  ))

  harness.registerTool(ctx, makeTool(
    'lw_wait',
    '消费「面板」视图的浏览器输入（choice 或 panel_input）。必须先有发布（lw_choice 或 lw_panel 声明 waitId 后用户回传），本工具阻塞直到对应输入到达；已有未消费输入则立即返回。',
    {
      id: { type: 'string', required: true, description: '输入 id（choice 组 id 或面板 waitId）' },
      timeoutMs: { type: 'number', description: '超时毫秒，默认 600000；0 = 不超时' },
    },
    async (args) => {
      const id = args.id
      const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 600000
      const idx = inbox.findIndex((e) => e.id === id)
      if (idx >= 0) {
        const e = inbox.splice(idx, 1)[0]
        return JSON.stringify({ ok: true, kind: e.kind, value: e.value, text: e.text })
      }
      const event = await Promise.race([
        new Promise((resolve) => waiters.set(id, resolve)),
        timeoutMs > 0
          ? ctx.timeout(timeoutMs).then(() => { waiters.delete(id); throw new Error('lw_wait 超时 (' + timeoutMs + 'ms)') })
          : new Promise(() => {}),
      ])
      return JSON.stringify({ ok: true, kind: event.kind, value: event.value, text: event.text })
    },
  ))
}
