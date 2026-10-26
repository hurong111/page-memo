# PageMemo 网页便签备忘录

在任意网页侧边随手记便签，便签自动绑定当前页面；支持完成勾选、全局管理页、搜索筛选与导出备份。

## 功能

- 任意网页右下角「记一笔」，右侧抽屉记录便签
- 便签与页面 URL 绑定，下次打开同一页自动出现
- 黄 / 粉 / 蓝 / 绿 四色标签，支持完成勾选与删除
- 工具栏图标打开「全部便签」管理页，按站点分组
- 搜索、按未完成 / 已完成筛选
- 导出 JSON / TXT 备份，清除已完成
- 数据仅保存在本机 chrome.storage.local，不上传服务器

## 安装

1. 下载 `docs/download/page-memo.zip` 并解压
2. 打开 `chrome://extensions`，开启右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选择**包含 manifest.json 的那一层文件夹**
4. 打开任意网页，右下角出现「记一笔」即可使用

## 官网本地预览

双击 `docs/index.html`，或在浏览器打开 `file:///E:/work/image-grab/docs/index.html`。

## 目录结构

```
image-grab/
├── extension/        插件源码
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── memos.html
│   ├── memos.js
│   └── memos.css
├── docs/             官方宣传网站（GitHub Pages 发布目录）
│   ├── index.html
│   ├── css/style.css
│   ├── js/main.js
│   └── download/page-memo.zip
└── README.md
```

## 说明

本项目为课程实战作业，非商店上架版本。
