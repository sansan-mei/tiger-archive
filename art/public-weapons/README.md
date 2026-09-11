# 五种公开武器模型

游戏已通过 `client/models/public-weapons.json` 加载这些模型。作者均为 Quaternius；原始 GLB 在 `source/`，下载地址和 SHA-256 在 `sources.json`。

| 游戏武器 | 公开模型 | 原页面 | 授权 |
|---|---|---|---|
| 小手枪 | 9mm Pistol | https://poly.pizza/m/BoZWhFdsj4 | CC BY 3.0 |
| 标准炮 | Rifle | https://poly.pizza/m/KjHL5JJrxU | CC0 |
| 快速炮 | Scifi Smg | https://poly.pizza/m/NHYaHnTNIM | CC0 |
| 火箭筒 | Rocket Launcher | https://poly.pizza/m/GCqUvqleqN | CC0 |
| 激光炮 | Ray Gun | https://poly.pizza/m/DIcib0mihf | CC0 |

9mm Pistol by Quaternius, licensed under Creative Commons Attribution 3.0: https://creativecommons.org/licenses/by/3.0/ . Source: https://poly.pizza/m/BoZWhFdsj4 . Modifications: coordinate rotation, dimensions and grip alignment, conversion to Three.js JSON. Attribution must accompany redistributed copies.

其他四项按照各来源页面的 CC0 标记使用：https://creativecommons.org/publicdomain/zero/1.0/ 。

模型经过枪口朝向、尺寸和材质适配；保留各自轮廓。标准炮使用步枪式外观，快速炮使用冲锋枪式外观。数值及射击规则没有随外观修改。公开模型加载失败时保留原有武器。

转换脚本：`scripts/assets/convert-weapons.mjs`。该脚本仅转换资产，不构建应用或启动服务。预览为实际 Three.js 模型渲染。
