# 宿主工具链检测与安装提示

Code Lab **不**捆绑编译器。运行前检测本机工具；缺失则 `blocked` 并提示安装。

## 检测命令（doctor 可用）

```bash
python3 --version
uv --version
rustc --version
cargo --version
go version
```

项目信号文件：

| 语言 | 信号 |
|------|------|
| Python | `pyproject.toml`, `uv.lock`, `requirements.txt` |
| Rust | `Cargo.toml`, `Cargo.lock` |
| Go | `go.mod`, `go.sum` |

## MVP runner 最小依赖

| profile | 需要 |
|---------|------|
| `python-script` | `python3` |
| `python-uv-script` | `uv`（推荐 NixOS/本环境） |
| `rust-rustc-single` | `rustc` |
| `go-run-single` | `go` |

`cargo` / `go test` 为 Phase 2。

## NixOS 提示（示例，按用户 flake 调整）

```bash
# 临时 shell 示例
nix-shell -p python3 uv rustc cargo go

# 或进入项目 devShell（若有 flake）
nix develop
```

不要在 skill 内 `nix-build` 出一套私有工具链当默认路径；应复用用户环境。

## 库从哪里来

- **单文件课**：尽量 std  only，降低依赖摩擦。  
- **需要第三方库的课**：在**用户项目**里用 uv/cargo/go.mod 声明；lesson 文档写明前置。  
- skill `examples/` 只放 lesson JSON，不 vendoring site-packages / target。

## 失败语义

| 情况 | run status | 对用户 |
|------|------------|--------|
| 无 rustc | `blocked` | 显示缺失工具 + 安装提示 |
| 编译/运行失败 | `failed` | 展示 stderr，供教学 |
| 超时 | `timeout` | 提示减小输入或查死循环 |
| 成功 | `ok` | 展示 stdout |

禁止在工具缺失时回退到「浏览器假执行」而不告知。
