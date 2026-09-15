/** 教学平面的「行为层」：把本包自带的使用手册注册成一个 bundled skill。
 *
 * 为什么由插件自己注册：纪律要跟着能力走。任何挂载本插件的会话（不论用哪个 preset）
 * 都应该在技能目录里看到 stage-panel。手册若只放在某个 preset 的 skills/ 里，
 * 其余会话就会停在「有工具、没纪律」的状态——白板能开，但不知道该怎么用。
 *
 * 与官方 @deepseek-ai/dsh-skill-badge 同一模式：list() 只给候选，get() 才读正文；
 * resourceBase 指向本包目录，正文里的相对路径（references/…、submode/…）才能解析。
 * provider 由 skills 服务托管，随插件 fiber 一起注销，不需要手动 cleanup。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SKILL_NAME = 'stage-panel'
const PROVIDER_NAME = 'teaching-board'
const SKILL_DIR = new URL('../skills/stage-panel/', import.meta.url)
const SKILL_BODY_URL = new URL('SKILL.md', SKILL_DIR)
const RESOURCE_BASE = { kind: 'directory', path: fileURLToPath(SKILL_DIR) }
const INVOCATION = { modelInvocable: true, userInvocable: true }
/** `@deepseek-ai/dsh-skill` 导出的 BUNDLED_SKILL_RANK，随包发布技能的档次。
 *  这里写字面量而不 import：本插件只依赖 dsh-tools，不为了一个排序常量多一条依赖边。
 *  rank 只用于同一层内的重名排序（project > runtime > user），跨层由层远近决定。 */
const BUNDLED_SKILL_RANK = 600
/** frontmatter 缺 description 时的兜底；正常情况下以 SKILL.md 为准（单一真相）。 */
const FALLBACK_DESCRIPTION = 'DSH 教学平面（板书面板）使用手册。'

/** 拆掉正文首部的 YAML frontmatter：它服务于「被文件系统扫描」那种用法，
 *  由 provider 读取时属于元数据而非正文。只解析需要的一层 key: value。 */
function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match === null) return { meta: {}, content: raw }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (entry !== null) meta[entry[1]] = entry[2].trim()
  }
  return { meta, content: raw.slice(match[0].length).replace(/^\n+/, '') }
}

/** 构造 stage-panel 的 bundled 技能 provider（交给 ctx.skills.registerProvider）。 */
export function createSkillProvider() {
  let loaded
  const load = () => {
    if (loaded === undefined) {
      loaded = readFile(SKILL_BODY_URL, 'utf8').then((raw) => {
        const { meta, content } = splitFrontmatter(raw)
        return { description: meta.description ?? FALLBACK_DESCRIPTION, content }
      })
    }
    return loaded
  }

  return {
    name: PROVIDER_NAME,
    async list() {
      let description = FALLBACK_DESCRIPTION
      try {
        description = (await load()).description
      } catch {
        // 手册文件缺失时仍让目录条目可用，正文读取会在 get() 处明确报错。
      }
      return [{
        name: SKILL_NAME,
        description,
        invocation: INVOCATION,
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase: RESOURCE_BASE,
        rank: BUNDLED_SKILL_RANK,
        locator: SKILL_BODY_URL,
        path: fileURLToPath(SKILL_BODY_URL),
      }]
    },
    async get() {
      const { description, content } = await load()
      return {
        name: SKILL_NAME,
        description,
        invocation: INVOCATION,
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase: RESOURCE_BASE,
        content,
        path: fileURLToPath(SKILL_BODY_URL),
      }
    },
  }
}
