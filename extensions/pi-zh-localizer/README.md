# Pi Chinese Localizer

配置内置的 Pi 交互界面汉化补丁器，补丁来源于 `509992828/pi-zh-pi-coding-agent`，按其 MIT 许可证保留。

```bash
node extensions/pi-zh-localizer/localize.mjs
node extensions/pi-zh-localizer/localize.mjs --check
```

默认定位 `npm root -g` 中的 `@earendil-works/pi-coding-agent/dist`。可通过 `--dist /path/to/dist` 指定目标目录，方便验证或非全局安装。

本仓库的 `install.mjs` 在安装本地 Pi 包后自动执行该补丁器。它是幂等的：原始英文已不存在时会识别已有的中文文本；只有既找不到英文也找不到中文的条目会报告为版本漂移。
