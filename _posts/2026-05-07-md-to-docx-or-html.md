---
layout: post
title: "丑死了的文档 - Pandoc 文档转换美化指南(md转docx或html)"
subtitle: "从 Markdown 到 Word/HTML 的美化之路"
date: 2026-05-05 20:00:00 +0800
categories: [工具, 文档处理]
tags: [pandoc, markdown, word, html, css, 效率]
author: Leon Li
---

Pandoc 被誉为“文档转换的瑞士军刀”，但默认转换出来的文档往往样式简陋。本文将详细介绍如何使用 Pandoc 生成排版精美的 Word 和 HTML 文档。

## 一、Pandoc 简介

Pandoc 是一个开源的文档格式转换工具，支持 Markdown、HTML、Word、PDF、LaTeX 等数十种格式之间的相互转换。本文聚焦于最常见的两个目标格式：**Word（docx）**和 **HTML**。

## 二、Word 文档排版美化

默认转换生成的 Word 文档样式较为简单。想要获得专业排版效果，最核心的方法是使用 **参考文档（reference-doc）**。

### 2.1 基础转换命令

```bash
pandoc input.md -o output.docx
```

### 2.2 使用参考文档模板

先导出一个默认模板文件：

```bash
pandoc --print-default-data-file reference.docx > my_template.docx
```

然后使用该模板进行转换：

```bash
pandoc input.md --reference-doc=my_template.docx -o output.docx
```

### 2.3 解决表格样式问题

Pandoc 生成的默认模板中，表格样式 `Table` 处于**隐藏状态**。

**解决方法**：

1. 用 Word 打开 `my_template.docx`
2. 打开样式侧边栏（`Alt + Ctrl + Shift + S`）
3. 点击底部的“管理样式”按钮
4. 找到灰色的 `Table`（旁边有“使用前隐藏”字样）
5. 选中后点击“显示”，或直接右键选择“修改”
6. 设置边框（推荐“全部边框”）、字体、行距等格式
7. 保存模板

从此以后，所有通过该模板转换的文档表格都会自动应用此样式。

### 2.4 常用格式化参数

| 参数 | 说明 |
|------|------|
| `--toc` | 自动生成目录 |
| `--toc-depth=3` | 目录深度为 3 级 |
| `--highlight-style=tango` | 设置代码高亮主题 |
| `--number-sections` | 自动编号章节 |

综合使用示例：

```bash
pandoc input.md -o output.docx \
  --reference-doc=my_template.docx \
  --toc \
  --highlight-style=tango
```

## 三、HTML 文档排版美化

转换为 HTML 时，可以通过自定义 CSS 来完全控制文档外观。

### 3.1 基础命令

```bash
pandoc input.md -o output.html --css=styles.css
```

### 3.2 常用 CSS 样式模板

以下是一套完整的 Markdown 转 HTML 专用样式：

```css
/* 整体排版 */
body {
    font-family: "Noto Serif SC", Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.7;
    color: #333;
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
}

/* 段落首行缩进 */
p {
    text-indent: 2em;
    margin: 0.8em 0;
    text-align: justify;
}

/* 标题样式 */
h1 {
    font-size: 2em;
    color: #2c3e50;
    border-bottom: 2px solid #3498db;
    padding-bottom: 10px;
    margin-top: 1.5em;
}

h2 {
    font-size: 1.5em;
    color: #34495e;
    border-left: 4px solid #3498db;
    padding-left: 15px;
    margin-top: 1.2em;
}

/* 代码样式 */
code {
    background-color: #f4f4f4;
    padding: 2px 5px;
    border-radius: 3px;
    font-family: "Source Code Pro", Consolas, monospace;
    font-size: 0.9em;
}

pre {
    background-color: #f8f8f8;
    padding: 15px;
    border-radius: 5px;
    overflow-x: auto;
    border: 1px solid #ddd;
}

pre code {
    background: none;
    padding: 0;
}

/* 引用样式 */
blockquote {
    font-style: italic;
    color: #555;
    border-left: 4px solid #3498db;
    margin: 1em 0;
    padding: 0.5em 0 0.5em 1.5em;
    background-color: #f9f9f9;
}

/* 表格样式 */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
}

th, td {
    padding: 10px;
    border: 1px solid #ddd;
    text-align: left;
}

th {
    background-color: #f5f5f5;
    font-weight: bold;
}

tr:nth-child(even) {
    background-color: #fafafa;
}

/* 图片样式 */
img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1.5em auto;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* 链接样式 */
a {
    color: #3498db;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
    color: #2980b9;
}
```

### 3.3 指定多个 CSS 文件

```bash
pandoc input.md -o output.html --css=reset.css --css=main.css
```

### 3.4 生成独立 HTML 文件

使用 `--self-contained` 参数可以将 CSS 直接嵌入 HTML，生成单个独立文件：

```bash
pandoc input.md -o output.html --css=styles.css --self-contained
```

## 四、完整工作流示例

假设你的博客文章 `post.md` 需要同时生成 Word 和 HTML 版本：

```bash
# 1. 准备模板和样式文件
pandoc --print-default-data-file reference.docx > my_template.docx
# 在 Word 中编辑模板样式，将 Table 样式设为显示并设置边框

# 2. 生成 Word 文档
pandoc post.md -o post.docx \
  --reference-doc=my_template.docx \
  --toc \
  --highlight-style=pygments

# 3. 生成 HTML 文档
pandoc post.md -o post.html \
  --css=/assets/css/pandoc.css \
  --self-contained
```

## 五、常见问题

### Q1：修改表格样式后 Word 转换没有变化？

**A**：检查是否在“管理样式”中找到并修改了 `Table` 样式。Pandoc 默认识别的是 `Table` 名称，而不是 `Table Grid` 等内置样式。

### Q2：为什么我创建的 Table 样式提示“已存在”？

**A**：因为模板中已有隐藏的 `Table` 样式。不需要新建，直接在“管理样式”中找到并修改即可。

### Q3：HTML 转换后的表格很难看？

**A**：CSS 中 `th, td { border: 1px solid #ddd; }` 这行是关键。如果没有边框，表格会很难看，记得加上。

### Q4：如何让代码块有语法高亮？

**A**：
- Word 格式使用 `--highlight-style=tango` 参数
- HTML 格式通过 CSS 配合 `<pre><code>` 结构实现

## 六、扩展阅读

- Pandoc 官方手册：https://pandoc.org/MANUAL.html
- Pandoc 支持的代码高亮风格：https://pandoc.org/MANUAL.html#option--highlight-style
- Word 样式修改指南：https://support.microsoft.com/zh-cn/word

*本文中的示例代码均已在 Pandoc 3.x / Word 365 环境下测试通过。*
