/** @arcaneorion/dsh-teaching-board — host 半（静态 bundle）。
 *
 * 定位：会话内「教学平面」——把 agent 生成的 self-contained HTML 投影为可讲解、
 * 可勾画、可截图的板书界面。
 *
 * 原生设计（单一数据流）：只注册模型工具，无私有状态、无 RPC、无 wait。
 * 「面板」状态 = 会话中最近一次 stage_* 工具调用的参数（client 从会话快照消费）；
 * 用户点选/回传 = 真实用户消息（DSH 原生输入流）。
 *
 * 截图为什么不能出现在工具结果里：面板渲染在用户浏览器的沙箱 iframe 内，宿主拿不到
 * 那些像素，而静态 bundle 也无法向客户端注册自定义 Remote 端点。所以截图走产品既有的
 * 用户输入通道回来——client 半捕获后把 PNG 放进输入草稿并提交，图片作为一条真实用户
 * 消息进入会话，模型在下一轮就能看见。这与 stage_choice 的机制完全一致。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'teaching-board'
export const inject = ['tools']

export function apply(ctx) {
  const textRender = (_args, value) => [{ type: 'text', text: value }]

  ctx.tools.register(defineTool({
    name: 'stage_panel',
    description:
      '把一份 self-contained HTML 投影到会话「教学平面」（面板视图，沙箱 iframe 渲染）。'
      + '先用完整 HTML（内联 CSS/JS、data: 资源，不依赖外网）调用本工具；随后正常回复即可，用户会在「教学平面」页签看见板书。'
      + '面板内纯本地交互（筛选/tab/滑块等）不打扰对话；需要用户在方向上做选择时另用 stage_choice。'
      + '用户可以在面板上直接圈画并用「截图」把画面变成图片发回本会话（见 stage_snapshot）。'
      + '若面板内含 postMessage 回传（{type:"panel_input",text}），用户发送的内容会以用户消息到达本会话。',
    parameters: {
      html: { type: 'string', required: true, description: '完整 self-contained HTML 文档字符串' },
      title: { type: 'string', description: '面板标题（显示在状态条）' },
    },
    output: { schema: { type: 'string' }, render: textRender },
    execute: async (args) => JSON.stringify({
      ok: true,
      rendered: true,
      title: typeof args.title === 'string' ? args.title : null,
      note: '请结束本轮回复；教学平面视图会从本次调用渲染。',
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'stage_status',
    description: '更新「教学平面」的状态条与上下文信息（当前讲到哪、任务、阶段、等待态等）。',
    parameters: {
      title: { type: 'string', description: '状态条标题（通常是当前这一段教学的主题）' },
      state: { type: 'string', description: '状态：idle / working / waiting_for_user / done' },
      context: { type: 'array', description: '上下文行数组 [{label,value}]，例如 [{label:"进度",value:"3/8"}]' },
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
      '在教学平面底部发布方向选项（choice 栏），用于「下一步讲什么 / 要不要继续」这类分支。'
      + '发布后结束本轮：用户点选会以用户消息（“[面板选择] <选项>”）到达本会话，无需也不要用任何 wait 工具。',
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

  ctx.tools.register(defineTool({
    name: 'stage_snapshot',
    description:
      '请求把「教学平面」当前的画面截图（含用户在其上的圈画笔迹），并把这张图发回本会话。'
      + '图片不会出现在本工具的结果里：它会作为一条带图片的真实用户消息回来，你在下一轮就能看到它——'
      + '所以调用后请结束本轮，不要在同一轮里假装已经看到图。'
      + '生效前提：用户此刻正停留在「教学平面」页签（该页签没挂载就截不到图，此时会返回失败原因，请让用户切到教学平面页签后重试）。'
      + '典型用途：学生圈出了看不懂的地方让你看、你想核对自己画的板书是否讲清楚了、想把当前画面留档。'
      + '不要连续调用；每轮最多一次。',
    parameters: {
      note: { type: 'string', description: '随图片一起发回的一句话说明（例如「请看我圈的这一步」）。默认“［面板截图］”。' },
    },
    output: { schema: { type: 'string' }, render: textRender },
    execute: async (args) => JSON.stringify({
      ok: true,
      requested: true,
      requestId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      note: typeof args.note === 'string' && args.note.trim() !== '' ? args.note : '［面板截图］',
      next: '结束本轮；client 半会在面板挂载时截图并以用户消息发回，你在下一轮看到图片。',
    }),
  }))
}
