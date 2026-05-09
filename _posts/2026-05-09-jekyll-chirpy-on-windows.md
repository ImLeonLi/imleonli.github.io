---
layout: post
title: "该死的 Jekyll — Windows 搭建 Chirpy 主题博客踩坑全记录"
subtitle: "从 gem 安装到 GitHub Pages 部署，每一步都是坑"
date: 2026-05-09 16:00:00 +0800
categories: [折腾, 博客搭建]
tags: [jekyll, chirpy, github-pages, ruby, windows, 踩坑]
author: Leon Li
---

本文记录了我在 Windows 上使用 Jekyll + GitHub Pages 搭建 Chirpy 主题博客的完整踩坑经历。如果你也正在折腾这件事，希望这篇文章能帮你少走弯路。

## 一、背景

想搭个静态博客，选了 Jekyll + GitHub Pages 这条路——免费、不用服务器、Markdown 写作，听起来很美好。主题选了 [jekyll-theme-chirpy](https://github.com/cotes2020/jekyll-theme-chirpy)，功能全面、样式好看。

然后噩梦就开始了。

## 二、安装 Ruby：走了弯路

安装 Ruby 这一步就踩了坑。

### rbenv for Windows — 别折腾了

在 [Ruby 官方安装页面](https://www.ruby-lang.org/zh_cn/documentation/installation/#managers) 上看到了 **rbenv for Windows**，说是可以用 PowerShell 在 Windows 上管理多个 Ruby 版本，命令行接口和 Unix 上的 rbenv 兼容，听起来很美好。

实际上根本没跑起来。具体报错已经记不清了，总之就是各种不配合。后来搜了一圈发现，rbenv for Windows 社区小、文档少、坑多，在 Windows 上远没有 RubyInstaller 成熟。

**结论：Windows 上别用 rbenv，直接 RubyInstaller。**

### RubyInstaller — 正确的选择

最终老老实实用 [RubyInstaller](https://rubyinstaller.org/) 下载了 exe 安装包，一路下一步就装好了。

**重要提醒**：下载时选择文件名含 **WITH DEVKIT** 的版本（如 `Ruby+Devkit 3.4.x (x64)`），安装过程会自动配置 MSYS2 编译工具链。如果选了不带 Devkit 的版本，后面安装 gem 原生扩展时还得手动补 MSYS2，多一步麻烦。

## 三、环境准备：MSYS2 哪去了？

### 安装 Jekyll

装好 Ruby 后，运行：

```powershell
gem install jekyll bundler
```

结果一堆 `Successfully installed` 之后，最后一行来了个：

```
MSYS2 could not be found. Please run 'ridk install'
or download and install MSYS2 manually from https://msys2.github.io/
```

### 什么是 MSYS2？什么是 ridk？

Jekyll 的很多依赖 gem 包含 C 语言写的原生扩展，编译它们需要一个工具链。在 macOS 上有 Xcode，Linux 上有 gcc，而 Windows 上就需要 **MSYS2**。

**ridk** 是 RubyInstaller 自带的工具，用来管理 MSYS2。运行 `ridk install` 就能装上。

### 解决方法

```powershell
ridk install
```

弹出菜单后输入 `3`，选择安装完整的 MSYS2 和 MinGW 工具链，等它跑完就行。

> **注意**：MSYS2 官方下载地址是 [https://www.msys2.org/](https://www.msys2.org/)，不是旧域名 `msys2.github.io`。如果你手动安装 MSYS2，记得去新地址。

> **建议**：安装 Ruby 时直接选择带 **Devkit** 的版本（文件名含 `WITH DEVKIT`），安装过程会自动配置 MSYS2，省心很多。

## 四、gem、bundle、ridk — 到底用哪个？

这是新手最困惑的问题之一，三个命令长得像、用途不同，很容易搞混。

### gem — Ruby 的包管理器

`gem` 相当于 Node.js 的 npm、Python 的 pip，用来安装和管理 Ruby 包。

```powershell
gem install jekyll          # 安装一个包
gem list                    # 查看已安装的包
gem uninstall jekyll        # 卸载
```

**使用场景**：安装单个工具时用。比如 `gem install jekyll bundler`。

**问题**：gem 是全局安装的，不管版本冲突。项目 A 要 jekyll 4.0，项目 B 要 jekyll 3.8，gem 管不了。

### bundle（Bundler）— 项目依赖管理器

`bundle` 是项目级别的依赖管理器，根据项目根目录的 `Gemfile` 来管理依赖版本。

```powershell
bundle install              # 按 Gemfile 安装所有依赖
bundle update               # 更新依赖
bundle exec jekyll serve    # 在 Gemfile 约束下运行命令
```

**核心文件**：
- `Gemfile` — 声明项目需要哪些 gem 及版本
- `Gemfile.lock` — 锁定实际安装的精确版本，保证团队和部署环境一致

**使用场景**：项目有 `Gemfile` 时，一切操作都优先用 bundle。

### ridk — Windows 专属的修复工具

`ridk` 是 RubyInstaller 的配套工具，只在 Windows 上存在，用于管理 MSYS2 开发工具链。

```powershell
ridk install                # 安装 MSYS2 工具链
ridk version                # 查看当前版本
ridk enable                 # 让已安装的 MSYS2 生效
```

**使用场景**：安装 Ruby 原生扩展报错时（比如 `Failed to build gem native extension`），运行 `ridk install`。

### 一句话总结

> **gem** 装包，**bundle** 管项目的包版本，**ridk** 是 Windows 上修编译环境的工具。

| Ruby 世界 | Node.js 世界 | Python 世界 |
|-----------|-------------|-------------|
| gem | npm（全局） | pip |
| bundle + Gemfile | npm + package.json | pip + requirements.txt |

## 五、bundle exec jekyll serve vs jekyll serve

这是另一个经典坑。

### jekyll serve — 用全局环境运行

直接用系统全局安装的 gem 运行，不管 Gemfile 里写了什么版本要求。

我第一次用 `jekyll serve` 就报了：

```
You have already activated bigdecimal 4.1.2, but your Gemfile requires bigdecimal 3.3.1.
```

系统装了 4.1.2，项目要 3.3.1，直接打架。

### bundle exec jekyll serve — 用项目环境运行

在 Gemfile 的约束下运行，bundler 会确保只用 Gemfile 指定版本的 gem。

```powershell
bundle exec jekyll serve
```

加了 `bundle exec` 之后，版本冲突的问题就没了。

### 什么时候用哪个？

| 情况 | 命令 |
|------|------|
| 项目有 Gemfile | **`bundle exec jekyll serve`** |
| 纯测试、没有 Gemfile | `jekyll serve` |
| 不确定 | 用 `bundle exec`，不会出错 |

**简单记忆**：有 Gemfile 就加 `bundle exec`，准没错。

## 六、html-proofer 找不到

用 Chirpy 源码运行时还遇到了：

```
Could not find gem 'html-proofer (~> 5.0)' in locally installed gems.
```

`html-proofer` 是主题开发和测试用的工具，普通写博客根本不需要。打开 `Gemfile`，找到这行注释掉：

```ruby
# gem "html-proofer", "~> 5.0"
```

然后 `bundle install` 就好了。

## 七、最大的坑：Fork 源码后部署只显示 Front Matter

这是让我最崩溃的问题。本地 `bundle exec jekyll serve` 跑得好好的，推到 GitHub 后 Actions 也执行成功了，但访问网站只看到：

```
--- layout: home # Index page ---
```

YAML Front Matter 被当纯文本输出了——说明 Jekyll 根本没有正确构建。

### 为什么会这样？

因为我直接 **fork 了 jekyll-theme-chirpy 的源码仓库**。

Chirpy 源码仓库是**主题开发项目**，不是博客站点项目。它包含大量开发用的文件（测试、构建脚本、`tools/` 目录等），构建流程和普通站点完全不同。GitHub Pages 默认的构建方式处理不了这些额外的东西。

### 折腾过程

- 在 Settings 的 Actions 和 Pages 中来回改配置 — 无效
- 搜索各种方案 — 要么过时，要么不管用
- 在 [issue #853](https://github.com/cotes2020/jekyll-theme-chirpy/issues/853) 看到有人说删掉仓库重来

### 最终解决方案：用 chirpy-starter 模板

删掉旧仓库，改用官方推荐的 **chirpy-starter** 方式：

1. 登录 GitHub，进入 [chirpy-starter](https://github.com/cotes2020/chirpy-starter)
2. 点击 **Use this template** → **Create a new repository**
3. 仓库名填 `<username>.github.io`（比如 `ImLeonLi.github.io`）
4. Clone 到本地，`bundle install`，`bundle exec jekyll serve`

就这样，没有任何额外配置，直接能跑。推送后 GitHub Actions 也自动部署成功。

### Fork 源码 vs Starter 模板

| 对比项 | Fork 源码 | chirpy-starter |
|--------|-----------|----------------|
| 内容 | 主题全部源码 + 开发工具 + 测试 | 只有博客必需的配置和文章目录 |
| Gemfile 依赖 | 包含开发依赖（html-proofer 等） | 只有运行时依赖，干净 |
| 构建流程 | 需要额外步骤 | 直接 `jekyll build` |
| 需要手动配置 Settings | 是 | 否，开箱即用 |
| 升级主题 | 需要手动合并代码 | `bundle update jekyll-theme-chirpy` 一行搞定 |

**结论：写博客用 starter，开发主题才 fork。**

## 八、GitHub Actions 自动部署

用 starter 模板创建的仓库自带 GitHub Actions 工作流配置，推送代码后自动构建部署。我的情况是完全没有碰 **Settings** 就部署好了，所以下面的步骤可能不是必须的。

如果你需要手动配置，步骤如下：

### 8.1 配置权限

仓库 → **Settings** → **Actions** → **General**，底部 **Workflow permissions** 选：

```
✅ Read and write permissions
```

### 8.2 配置 Pages 部署源

仓库 → **Settings** → **Pages**，Source 选 **GitHub Actions**。

### 8.3 Gemfile.lock 平台问题

Windows 上生成的 `Gemfile.lock` 不包含 Linux 平台信息，但 GitHub Actions 在 Linux 上运行。需要：

```powershell
bundle lock --add-platform x86_64-linux
```

### 8.4 推送触发部署

```powershell
git add .
git commit -m "new post"
git push origin main
```

推送后到仓库的 **Actions** 选项卡查看部署状态。

## 九、写文章

在 `_posts/` 目录下创建文件，文件名格式：

```
YYYY-MM-DD-title.md
```

比如 `2026-05-09-my-post.md`，内容：

```markdown
---
layout: post
title: "文章标题"
date: 2026-05-09 16:00:00 +0800
categories: [分类1, 分类2]
tags: [标签1, 标签2]
---

正文内容...
```

## 十、最终的正确姿势

总结一下，在 Windows 上用 Chirpy 主题搭博客的正确流程：

1. **安装 Ruby+Devkit**（自带 MSYS2，省事；别用 rbenv for Windows）
2. **用 chirpy-starter 模板创建仓库**（不要 fork 源码！）
3. **Clone 到本地**，运行 `bundle install`
4. **修改 `_config.yml`**（url、timezone、lang 等）
5. **用 `bundle exec jekyll serve`** 本地预览（不要用 `jekyll serve`）
6. **`bundle lock --add-platform x86_64-linux`**（Windows 必做）
7. **推送到 GitHub**，Actions 自动部署

就这些。如果当初有人告诉我这些，我能少折腾好几天。

## 十一、参考链接

- [Chirpy 官方文档 - Getting Started](https://chirpy.cotes.page/posts/getting-started/): <https://chirpy.cotes.page/posts/getting-started/>
- [chirpy-starter 模板](https://github.com/cotes2020/chirpy-starter): <https://github.com/cotes2020/chirpy-starter>
- [MSYS2 官网](https://www.msys2.org/): <https://www.msys2.org/>
- [Jekyll 官方安装文档](https://jekyllrb.com/docs/installation/): <https://jekyllrb.com/docs/installation/>
- [Ruby 官方安装页面](https://www.ruby-lang.org/zh_cn/documentation/installation/#managers): <https://www.ruby-lang.org/zh_cn/documentation/installation/#managers>
- [RubyInstaller 下载](https://rubyinstaller.org/): <https://rubyinstaller.org/>
- [rbenv for Windows](https://github.com/RubyMetric/rbenv-for-windows): <https://github.com/RubyMetric/rbenv-for-windows>（不推荐）
- [Chirpy Issue #853 - 部署后只显示 Front Matter](https://github.com/cotes2020/jekyll-theme-chirpy/issues/853): <https://github.com/cotes2020/jekyll-theme-chirpy/issues/853>
