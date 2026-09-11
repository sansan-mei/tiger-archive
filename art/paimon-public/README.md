# 派蒙公开模型 · 本地使用

用户要求改用公开现成模型，本目录为公开配布的派蒙 MMD 模型及本地 Blender / GLB 转换。角色版权 miHoYo，MMD 模型编辑神帝宇；不是本项目自行制作的角色。

## 来源

- [Paimon v1.6 公开资产索引](https://github.com/UuuNyaa/blender_mmd_assets/issues/226)
- [原神官方 MMD 模型汇总](https://mmdfr.fr/genshin-mmd/)
- [下载的原始 ZIP](https://activity.hdslb.com/blackboard/static/20210604/4d40bc4f98f94fbc71c235832ce3efd4/pVCd3ADzvJ.zip)
- ZIP SHA-256：`59cd57c7fc373ee05ccebe6d866fced5cca70cf2fac5d32e45d433787a1db4b2`

原始压缩包、PMX、贴图和 `使用规则.txt` 完整保留在 `source/`。原文件注明不可商用、不可二配；本轮仅为用户本地查看和玩耍整理，没有对外发布。

## 文件

- **`paimon.blend`**：建议打开的 Blender 文件，已嵌入贴图并设置贴图工作室视图。原有蒙皮骨骼和表情形态键保留。
- **`paimon.glb`**：自包含 glTF 文件，约 4.2 MiB；含 1 套蒙皮、219 个骨骼节点（包括辅助骨骼）、49 个表情目标和 5 张内嵌贴图。
- `front.png`、`three-quarter.png`、`back.png`、`face-detail.png`：模型的实际 Blender Workbench 预览。
- `../../client/models/paimon.json`：游戏实际加载的贴图蒙皮模型，约 4.2 MiB。
- `../../scripts/assets/convert-paimon.mjs`：从 GLB 转换运行时资源的脚本，使用项目现有 Three.js 依赖。

这是原版派蒙造型，保留头顶光环、复杂袖口、鞋饰和星空披风。用户给出的图是对该造型的简化改绘，因此两者在这些部位有区别。

## 转换说明

使用 [MMD Tools](https://github.com/MMD-Blender/blender_mmd_tools) 提交 `29d1478cf4385945b1c011d4c1e6adda7ad7cf70` 临时导入，未全局安装插件。PMX 导入保留网格、骨骼和表情，未启用物理模拟。导入器提示缺少 MMD 通用 `toon01.bmp` / `toon02.bmp`；展示文件已使用实际角色贴图重建标准材质，去除这两个无效占位贴图，查看 `paimon.blend` 不依赖它们。

预览采用 Workbench 贴图模式，不需要高成本渲染；GLB 使用标准 PBR 材质，实际光照效果取决于使用它的软件。MMD 专用球面高光与特殊效果没有等价移植，展示文件采用静态不透明的披风纹理。

已确认导出文件包含蒙皮、49 个表情、全部基础贴图，无外部贴图路径。角色几何为 13,798 个三角形。已替换游戏 human 单位外观，使用加权骨骼驱动行走、有限幅度转身瞄准和开火反馈；武器仍使用原游戏挂点和射程。游戏文件移除了暂未使用的表情形态键，Blender / GLB 源文件完整保留。没有运行项目打包。
