# 下载与自动更新存储

`download.miaoyww.top` 继续使用现有 R2 bucket `veto`。产品使用对象前缀隔离，不需要更换域名或修改 `R2_BUCKET`。

| 产品 | 对象目录 | 公共地址 |
| --- | --- | --- |
| Veto | `veto/releases/` | `https://download.miaoyww.top/veto/releases/` |
| Nons | `nons/` | `https://download.miaoyww.top/nons/` |

Veto 的发布工作流把安装包、压缩包、blockmap 和每个版本的构建清单放入 `veto/releases/<tag>/`；当前版本清单位于 `veto/releases/latest.json`、`latest.yml` 和 `latest-mac.yml`，清单中的绝对下载地址也包含 `veto/`。Electron 与官网使用相同目录。

2026-10-16 迁移前的客户端仍请求 `/releases/latest.yml` 或 `/releases/latest-mac.yml`。发布流程在旧目录同步写入三个当前版本清单作为兼容入口，下载地址指向新目录，不再向旧目录上传安装包。历史版本的安装包、blockmap 和构建清单也迁入 `veto/`。旧目录仅保留 `latest.json`、`latest.yml` 与 `latest-mac.yml` 三个兼容清单，不能改成 Nons 清单，避免旧版 Veto 读取其他产品的更新。

Nons 的 `nons/` 目录使用空的 `.keep` 对象保留。实际自动更新清单及签名应由 Nons 的发布流程生成；不要把 Veto 的 Electron 清单用作 Nons 的更新响应。Nons 接入时在 `nons/` 下选择所需的清单路径，并让发布流程与客户端使用一致的路径。
