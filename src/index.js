/** @arcaneorion/dsh-stage-panel — host 半（静态 bundle）。
 * 原生设计（单一数据流）：只注册模型工具，无私有状态、无 RPC、无 wait。
 * 「面板」状态 = 会话中最近一次 stage_* 工具调用的参数（client 从会话快照消费）；
 * 用户点选/回传 = 真实用户消息（DSH 原生输入流）。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'stage-panel'
export const inject = ['tools']

export function apply(ctx) {
  const textRender = (_args, value) => [{ type: 'text', text: value }]

  ctx.tools.register(defineTool({
    name: 'stage_panel',
    description:
      '把一份 self-contained HTML 投影到会话「面板」视图（沙箱 iframe 渲染）。先用完整 HTML（内联 CSS/JS，不依赖外网）调用本工具；随后正常回复即可，用户会在「面板」选项卡看见结果。面板内纯本地交互（筛选/tab/滑块等）不打扰对话；需要用户选择推进时另用 stage_choice。若面板内含 postMessage 回传（{type:"panel_input",text}），用户发送的内容会以用户消息到达本会话。',
    parameters: {
      html: { type: 'string', required: true, description: '完整 self-contained HTML 文档字符串' },
      title: { type: 'string', description: '面板标题（显示在状态条）' },
    },
    output: { schema: { type: 'string' }, render: textRender },
    execute: async (args) => JSON.stringify({
      ok: true,
      rendered: true,
      title: typeof args.title === 'string' ? args.title : null,
      note: '请结束本轮回复；面板视图会从本次调用渲染。',
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'stage_status',
    description: '更新「面板」视图的状态条与上下文信息（任务、阶段、等待态等）。',
    parameters: {
      title: { type: 'string', description: '状态条标题' },
      state: { type: 'string', description: '状态：idle / working / waiting_for_user / done' },
      context: { type: 'array', description: '上下文行数组 [{label,value}]' },
    },
    output: { schema: { type: 'string' }, render: textRender },
    execute: async (args) => JSON.stringify({
      ok: true,
      status: {
        title: typeof args.title === 'string' ? args.title : null,
        state: typeof args.state === 'string' ? args.state : null,
        context: Array.isArray(args.context) ? args.context.length : 0,
      },
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'stage_choice',
    description:
      '在「面板」视图底部发布方向选项（choice 栏）。发布后结束本轮：用户点选会以用户消息（“[面板选择] <选项>”）到达本会话，无需也不要用任何 wait 工具。',
    parameters: {
      id: { type: 'string', required: true, description: 'choice 组 id' },
      options: { type: 'array', required: true, description: '[{id,label}] 选项数组' },
    },
    output: { schema: { type: 'string' }, render: textRender },
    execute: async (args) => {
      const opts = Array.isArray(args.options)
        ? args.options.filter((o) => o && typeof o.id === 'string').map((o) => ({ id: o.id, label: typeof o.label === 'string' ? o.label : o.id }))
        : []
      return JSON.stringify({ ok: true, choiceId: args.id, optionCount: opts.length, next: '用户点选后将以用户消息到达，无需 wait' })
    },
  }))
}
